/**
 * Webhook parsing, idempotency and delivery-status handling (§15, §18, §37).
 */

jest.mock('../../src/config/prisma', () => jest.requireActual('../helpers/whatsappPrismaMock'));

import {
  resetWhatsAppPrismaMock,
  whatsAppConversation,
  whatsAppMessage,
  whatsAppWebhookEvent,
  booking,
  tenant,
} from '../helpers/whatsappPrismaMock';
import {
  parseWebhookEnvelope,
  persistWebhookEvent,
} from '../../src/Services/whatsapp/webhookEvent.service';
import { processWebhookItem, resolveTenantForWebhook } from '../../src/Services/whatsapp/webhookProcessor';
import { applyStatusUpdate } from '../../src/Services/whatsapp/message.service';

const TENANT = 'tenant-a';

const inboundEnvelope = (wamid = 'wamid.IN1', body = 'שלום') => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '972500000000', phone_number_id: 'pn-1' },
            contacts: [{ profile: { name: 'ישראל' }, wa_id: '972501234567' }],
            messages: [
              { from: '972501234567', id: wamid, timestamp: '1710000000', type: 'text', text: { body } },
            ],
          },
        },
      ],
    },
  ],
});

const statusEnvelope = (wamid: string, status: string) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            statuses: [
              {
                id: wamid,
                status,
                timestamp: '1710000100',
                recipient_id: '972501234567',
                conversation: { id: 'conv-1' },
              },
            ],
          },
        },
      ],
    },
  ],
});

beforeEach(() => {
  resetWhatsAppPrismaMock();
  process.env.WHATSAPP_ENABLED = 'true';
  process.env.WHATSAPP_PROVIDER = 'fake';
  delete process.env.WHATSAPP_TENANT_ID;
  tenant.__seed([{ id: TENANT, name: 'Maple', isActive: true, createdAt: new Date('2024-01-01') }]);
});

afterEach(() => {
  delete process.env.WHATSAPP_ENABLED;
  delete process.env.WHATSAPP_PROVIDER;
});

describe('parseWebhookEnvelope', () => {
  it('extracts an inbound text message', () => {
    const [item] = parseWebhookEnvelope(inboundEnvelope());
    expect(item).toMatchObject({
      kind: 'message',
      wamid: 'wamid.IN1',
      from: '972501234567',
      messageType: 'text',
      text: 'שלום',
      phoneNumberId: 'pn-1',
      profileName: 'ישראל',
    });
  });

  it('gives statuses a key that includes the status value', () => {
    const [sent] = parseWebhookEnvelope(statusEnvelope('wamid.OUT', 'sent'));
    const [delivered] = parseWebhookEnvelope(statusEnvelope('wamid.OUT', 'delivered'));
    // Same wamid, different logical events — they must not collide.
    expect(sent.externalEventId).not.toBe(delivered.externalEventId);
  });

  it('reads a media caption as the message text', () => {
    const envelope = inboundEnvelope();
    envelope.entry[0].changes[0].value.messages = [
      { from: '972501234567', id: 'wamid.M', timestamp: '1', type: 'image', image: { caption: 'תמונה' } },
    ] as never;
    expect(parseWebhookEnvelope(envelope)[0]).toMatchObject({ messageType: 'image', text: 'תמונה' });
  });

  it('extracts a template status update', () => {
    const [item] = parseWebhookEnvelope({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'message_template_status_update',
              value: {
                event: 'APPROVED',
                message_template_id: '123',
                message_template_name: 'contract_signed',
                message_template_language: 'he',
              },
            },
          ],
        },
      ],
    });
    expect(item).toMatchObject({ kind: 'template_status', templateName: 'contract_signed', event: 'APPROVED' });
  });

  it.each([
    [{}, 'empty object'],
    [{ object: 'page' }, 'a different Meta product'],
    [{ object: 'whatsapp_business_account' }, 'no entry array'],
    [null, 'null'],
  ])('returns nothing for %s (%s)', (payload) => {
    expect(parseWebhookEnvelope(payload)).toEqual([]);
  });

  it('ignores messages with no id or sender', () => {
    const envelope = inboundEnvelope();
    envelope.entry[0].changes[0].value.messages = [{ type: 'text' }] as never;
    expect(parseWebhookEnvelope(envelope)).toEqual([]);
  });
});

describe('persistWebhookEvent — idempotency', () => {
  it('stores a first delivery', async () => {
    const [item] = parseWebhookEnvelope(inboundEnvelope());
    const result = await persistWebhookEvent({ item, tenantId: TENANT });

    expect(result.duplicate).toBe(false);
    expect(whatsAppWebhookEvent.__rows()).toHaveLength(1);
  });

  it('reports a redelivery as a duplicate and stores only one row', async () => {
    const [item] = parseWebhookEnvelope(inboundEnvelope());
    const first = await persistWebhookEvent({ item, tenantId: TENANT });
    const second = await persistWebhookEvent({ item, tenantId: TENANT });

    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(whatsAppWebhookEvent.__rows()).toHaveLength(1);
  });

  it('treats sent and delivered for one message as two distinct events', async () => {
    const [sent] = parseWebhookEnvelope(statusEnvelope('wamid.OUT', 'sent'));
    const [delivered] = parseWebhookEnvelope(statusEnvelope('wamid.OUT', 'delivered'));

    expect((await persistWebhookEvent({ item: sent, tenantId: TENANT })).duplicate).toBe(false);
    expect((await persistWebhookEvent({ item: delivered, tenantId: TENANT })).duplicate).toBe(false);
    expect(whatsAppWebhookEvent.__rows()).toHaveLength(2);
  });
});

describe('processing an inbound message', () => {
  beforeEach(() => {
    booking.__seed([
      {
        id: 'booking-1',
        tenantId: TENANT,
        eventCode: 'EVT-1',
        clientAFullName: 'ישראל ישראלי',
        clientAPhone: '050-1234567',
        clientBPhone: null,
        updatedAt: new Date(),
      },
    ]);
  });

  it('creates one conversation and one message', async () => {
    const [item] = parseWebhookEnvelope(inboundEnvelope());
    await processWebhookItem(item, TENANT);

    expect(whatsAppConversation.__rows()).toHaveLength(1);
    expect(whatsAppMessage.__rows()).toHaveLength(1);
  });

  it('matches the booking by normalised phone, not by suffix guessing', async () => {
    const [item] = parseWebhookEnvelope(inboundEnvelope());
    await processWebhookItem(item, TENANT);

    expect(whatsAppConversation.__rows()[0].bookingId).toBe('booking-1');
    expect(whatsAppMessage.__rows()[0].bookingId).toBe('booking-1');
  });

  it('leaves the conversation unlinked for an unknown number instead of inventing a customer', async () => {
    const [item] = parseWebhookEnvelope(inboundEnvelope('wamid.UNKNOWN'));
    (item as { from: string }).from = '972529998888';
    await processWebhookItem(item, TENANT);

    expect(whatsAppConversation.__rows()[0].bookingId).toBeNull();
    expect(booking.__rows()).toHaveLength(1);
  });

  it('processing the same message twice yields one message and one conversation', async () => {
    const [item] = parseWebhookEnvelope(inboundEnvelope());

    await processWebhookItem(item, TENANT);
    await processWebhookItem(item, TENANT);

    expect(whatsAppMessage.__rows()).toHaveLength(1);
    expect(whatsAppConversation.__rows()).toHaveLength(1);
    // The unread counter must not double-count a redelivery either.
    expect(whatsAppConversation.__rows()[0].unreadCount).toBe(1);
  });

  it('opens the 24h customer-care window and flags the manager', async () => {
    const [item] = parseWebhookEnvelope(inboundEnvelope());
    await processWebhookItem(item, TENANT);

    const conversation = whatsAppConversation.__rows()[0];
    expect(conversation.lastInboundAt).toBeTruthy();
    expect(conversation.status).toBe('WaitingForManager');
  });
});

describe('status updates', () => {
  beforeEach(() => {
    whatsAppConversation.__seed([{ id: 'conv-1', tenantId: TENANT, phoneNumber: '972501234567' }]);
    whatsAppMessage.__seed([
      {
        id: 'msg-1',
        tenantId: TENANT,
        conversationId: 'conv-1',
        direction: 'Outbound',
        messageType: 'text',
        externalMessageId: 'wamid.OUT',
        status: 'Sent',
      },
    ]);
  });

  it('matches on externalMessageId', async () => {
    expect(
      await applyStatusUpdate({
        externalMessageId: 'wamid.OUT',
        providerStatus: 'delivered',
        occurredAt: new Date(),
      }),
    ).toBe(true);
    expect(whatsAppMessage.__rows()[0].status).toBe('Delivered');
  });

  it('advances Sent -> Delivered -> Read', async () => {
    await applyStatusUpdate({ externalMessageId: 'wamid.OUT', providerStatus: 'delivered', occurredAt: new Date() });
    await applyStatusUpdate({ externalMessageId: 'wamid.OUT', providerStatus: 'read', occurredAt: new Date() });
    expect(whatsAppMessage.__rows()[0].status).toBe('Read');
  });

  it('does not regress when Meta redelivers an older status out of order', async () => {
    await applyStatusUpdate({ externalMessageId: 'wamid.OUT', providerStatus: 'read', occurredAt: new Date() });
    await applyStatusUpdate({ externalMessageId: 'wamid.OUT', providerStatus: 'delivered', occurredAt: new Date() });
    expect(whatsAppMessage.__rows()[0].status).toBe('Read');
  });

  it('records a failure with its provider error code', async () => {
    await applyStatusUpdate({
      externalMessageId: 'wamid.OUT',
      providerStatus: 'failed',
      occurredAt: new Date(),
      errorCode: '131047',
      errorMessage: 'Re-engagement message',
    });
    expect(whatsAppMessage.__rows()[0]).toMatchObject({ status: 'Failed', errorCode: '131047' });
  });

  it('reports no match for a message this system never sent', async () => {
    expect(
      await applyStatusUpdate({
        externalMessageId: 'wamid.SENT_FROM_BUSINESS_APP',
        providerStatus: 'delivered',
        occurredAt: new Date(),
      }),
    ).toBe(false);
  });

  it('ignores a status value it does not understand', async () => {
    expect(
      await applyStatusUpdate({
        externalMessageId: 'wamid.OUT',
        providerStatus: 'warp_speed',
        occurredAt: new Date(),
      }),
    ).toBe(false);
    expect(whatsAppMessage.__rows()[0].status).toBe('Sent');
  });
});

describe('resolveTenantForWebhook', () => {
  it('uses the single active tenant', async () => {
    expect(await resolveTenantForWebhook('pn-1')).toBe(TENANT);
  });

  it('prefers an explicit WHATSAPP_TENANT_ID', async () => {
    process.env.WHATSAPP_TENANT_ID = 'tenant-explicit';
    expect(await resolveTenantForWebhook('pn-1')).toBe('tenant-explicit');
    delete process.env.WHATSAPP_TENANT_ID;
  });

  it('refuses to guess when several tenants are active', async () => {
    tenant.__seed([
      { id: 'tenant-a', isActive: true, createdAt: new Date('2024-01-01') },
      { id: 'tenant-b', isActive: true, createdAt: new Date('2024-02-01') },
    ]);
    // Guessing here would leak one tenant's messages into another.
    expect(await resolveTenantForWebhook(null)).toBeNull();
  });
});
