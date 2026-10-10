/**
 * Application send action (§41) — validation, the 24h window, and the outbox contract.
 */

jest.mock('../../src/config/prisma', () => jest.requireActual('../helpers/whatsappPrismaMock'));

import prisma from '../../src/config/prisma';
import {
  resetWhatsAppPrismaMock,
  whatsAppConversation,
  whatsAppMessage,
  whatsAppOutboxMessage,
  whatsAppTemplate,
} from '../helpers/whatsappPrismaMock';
import { queueWhatsAppMessage } from '../../src/Services/whatsapp/send.service';

const TENANT = 'tenant-a';

beforeEach(() => {
  resetWhatsAppPrismaMock();
  process.env.WHATSAPP_ENABLED = 'true';
  process.env.WHATSAPP_PROVIDER = 'fake';
});

afterEach(() => {
  delete process.env.WHATSAPP_ENABLED;
  delete process.env.WHATSAPP_PROVIDER;
});

/** Simulate a customer message so the free-form window is open. */
async function openWindow(phone = '972501234567') {
  const conversation = await prisma.whatsAppConversation.create({
    data: { tenantId: TENANT, phoneNumber: phone, status: 'WaitingForManager', lastInboundAt: new Date() },
  });
  return conversation;
}

describe('queueWhatsAppMessage', () => {
  it('refuses to queue anything while the integration is disabled', async () => {
    process.env.WHATSAPP_ENABLED = 'false';
    await expect(
      queueWhatsAppMessage({ kind: 'text', tenantId: TENANT, toPhone: '0501234567', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'WhatsAppNotConfigured' });
    expect(whatsAppOutboxMessage.__rows()).toHaveLength(0);
  });

  it('rejects an invalid phone number before writing anything', async () => {
    await expect(
      queueWhatsAppMessage({ kind: 'text', tenantId: TENANT, toPhone: '12345', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'InvalidPhoneNumber' });

    expect(whatsAppOutboxMessage.__rows()).toHaveLength(0);
    expect(whatsAppMessage.__rows()).toHaveLength(0);
    expect(whatsAppConversation.__rows()).toHaveLength(0);
  });

  it('blocks a free-form message outside the 24h customer-care window', async () => {
    await expect(
      queueWhatsAppMessage({ kind: 'text', tenantId: TENANT, toPhone: '0501234567', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'MessageNotAllowed' });
    // Better to reject now than burn five retry attempts on a guaranteed rejection.
    expect(whatsAppOutboxMessage.__rows()).toHaveLength(0);
  });

  it('queues a free-form message inside the window', async () => {
    await openWindow();
    const outcome = await queueWhatsAppMessage({
      kind: 'text',
      tenantId: TENANT,
      toPhone: '050-1234567',
      body: 'שלום',
    });

    expect(outcome.outboxId).toBeTruthy();
    expect(whatsAppOutboxMessage.__rows()[0]).toMatchObject({ status: 'Pending', messageType: 'text' });
    expect(whatsAppMessage.__rows()[0]).toMatchObject({ direction: 'Outbound', status: 'Pending' });
  });

  it('links the outbox row to its ledger message', async () => {
    await openWindow();
    const outcome = await queueWhatsAppMessage({
      kind: 'text',
      tenantId: TENANT,
      toPhone: '0501234567',
      body: 'x',
    });
    expect(whatsAppOutboxMessage.__rows()[0].messageId).toBe(outcome.messageId);
  });

  it('refuses a template Meta has not approved', async () => {
    whatsAppTemplate.__seed([
      { id: 't', tenantId: TENANT, name: 'contract_signed', language: 'he', metaStatus: 'Pending' },
    ]);

    await expect(
      queueWhatsAppMessage({
        kind: 'template',
        tenantId: TENANT,
        toPhone: '0501234567',
        templateName: 'contract_signed',
        languageCode: 'he',
      }),
    ).rejects.toMatchObject({ code: 'TemplateNotApproved' });
  });

  it('queues an approved template without needing an open window', async () => {
    whatsAppTemplate.__seed([
      { id: 't', tenantId: TENANT, name: 'contract_signed', language: 'he', metaStatus: 'Approved' },
    ]);

    const outcome = await queueWhatsAppMessage({
      kind: 'template',
      tenantId: TENANT,
      toPhone: '0501234567',
      templateName: 'contract_signed',
      languageCode: 'he',
    });

    expect(outcome.outboxId).toBeTruthy();
    expect(whatsAppOutboxMessage.__rows()[0]).toMatchObject({
      messageType: 'template',
      templateName: 'contract_signed',
    });
  });

  it('is idempotent for a repeated dedupe key and leaves no orphan ledger row', async () => {
    whatsAppTemplate.__seed([
      { id: 't', tenantId: TENANT, name: 'contract_signed', language: 'he', metaStatus: 'Approved' },
    ]);

    const command = {
      kind: 'template' as const,
      tenantId: TENANT,
      toPhone: '0501234567',
      templateName: 'contract_signed',
      languageCode: 'he',
      dedupeKey: 'contract-signed:booking-1',
    };

    const first = await queueWhatsAppMessage(command);
    const second = await queueWhatsAppMessage(command);

    expect(second.deduplicated).toBe(true);
    expect(second.outboxId).toBe(first.outboxId);
    expect(whatsAppOutboxMessage.__rows()).toHaveLength(1);
    expect(whatsAppMessage.__rows()).toHaveLength(1);
  });

  it('reuses one conversation across several sends to the same number', async () => {
    await openWindow();
    await queueWhatsAppMessage({ kind: 'text', tenantId: TENANT, toPhone: '0501234567', body: 'a' });
    await queueWhatsAppMessage({ kind: 'text', tenantId: TENANT, toPhone: '+972501234567', body: 'b' });

    expect(whatsAppConversation.__rows()).toHaveLength(1);
    expect(whatsAppMessage.__rows()).toHaveLength(2);
  });

  it('queues a document without requiring an open window', async () => {
    const outcome = await queueWhatsAppMessage({
      kind: 'document',
      tenantId: TENANT,
      toPhone: '0501234567',
      filename: 'contract.pdf',
      link: 'https://example.test/contract.pdf',
    });

    expect(outcome.outboxId).toBeTruthy();
    expect(whatsAppOutboxMessage.__rows()[0].messageType).toBe('document');
  });
});
