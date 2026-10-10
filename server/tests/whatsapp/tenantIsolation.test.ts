/**
 * Tenant isolation (§20, §38).
 *
 * Tenant A must never reach Tenant B's WhatsApp data. These assert the server-side
 * guarantee at the service layer, where the tenantId filter actually lives.
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
import {
  assignConversation,
  getOrCreateConversation,
  setConversationStatus,
  markConversationRead,
} from '../../src/Services/whatsapp/conversation.service';
import { cancelOutboxMessage, enqueueOutboxMessage } from '../../src/Services/whatsapp/outbox.service';
import { assertTemplateSendable, deleteTemplate, listTemplates } from '../../src/Services/whatsapp/template.service';
import { WhatsAppError } from '../../src/Services/whatsapp/errors';

const A = 'tenant-a';
const B = 'tenant-b';
const PHONE = '972501234567';

beforeEach(() => {
  resetWhatsAppPrismaMock();
});

describe('conversations', () => {
  it('gives each tenant its own conversation for the same phone number', async () => {
    const a = await getOrCreateConversation({ tenantId: A, phoneNumber: PHONE });
    const b = await getOrCreateConversation({ tenantId: B, phoneNumber: PHONE });

    expect(a.id).not.toBe(b.id);
    expect(whatsAppConversation.__rows()).toHaveLength(2);
  });

  it('returns the same conversation on a second call for one tenant', async () => {
    const first = await getOrCreateConversation({ tenantId: A, phoneNumber: PHONE });
    const second = await getOrCreateConversation({ tenantId: A, phoneNumber: '050-1234567' });

    // Different spelling, same normalised number — one thread.
    expect(second.id).toBe(first.id);
    expect(whatsAppConversation.__rows()).toHaveLength(1);
  });

  it('refuses to assign a conversation belonging to another tenant', async () => {
    const conversation = await getOrCreateConversation({ tenantId: A, phoneNumber: PHONE });

    const result = await assignConversation({
      tenantId: B,
      conversationId: conversation.id,
      assignedUserId: 'user-b',
    });

    expect(result.count).toBe(0);
    expect(whatsAppConversation.__rows()[0].assignedUserId).toBeUndefined();
  });

  it('refuses to change the status of another tenant’s conversation', async () => {
    const conversation = await getOrCreateConversation({ tenantId: A, phoneNumber: PHONE });
    const result = await setConversationStatus({
      tenantId: B,
      conversationId: conversation.id,
      status: 'Closed',
    });
    expect(result.count).toBe(0);
  });

  it('refuses to clear another tenant’s unread counter', async () => {
    const conversation = await getOrCreateConversation({ tenantId: A, phoneNumber: PHONE });
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 3 },
    });

    await markConversationRead({ tenantId: B, conversationId: conversation.id });
    expect(whatsAppConversation.__rows()[0].unreadCount).toBe(3);
  });
});

describe('messages', () => {
  it('scopes a message listing to the requesting tenant', async () => {
    whatsAppMessage.__seed([
      { id: 'm-a', tenantId: A, conversationId: 'c-a', direction: 'Inbound', messageType: 'text', content: 'A secret' },
      { id: 'm-b', tenantId: B, conversationId: 'c-b', direction: 'Inbound', messageType: 'text', content: 'B secret' },
    ]);

    const visibleToA = await prisma.whatsAppMessage.findMany({ where: { tenantId: A } });
    expect(visibleToA).toHaveLength(1);
    expect(visibleToA[0].content).toBe('A secret');
  });
});

describe('outbox', () => {
  it('refuses to cancel another tenant’s queued message', async () => {
    const { id } = await enqueueOutboxMessage({
      tenantId: A,
      toPhone: PHONE,
      request: { kind: 'text', to: PHONE, body: 'hi' },
    });

    expect(await cancelOutboxMessage({ tenantId: B, outboxId: id })).toBe(0);
    expect(whatsAppOutboxMessage.__rows()[0].status).toBe('Pending');
  });
});

describe('templates', () => {
  beforeEach(() => {
    whatsAppTemplate.__seed([
      { id: 't-a', tenantId: A, name: 'contract_signed', language: 'he', metaStatus: 'Approved' },
      { id: 't-b', tenantId: B, name: 'contract_signed', language: 'he', metaStatus: 'Approved' },
    ]);
  });

  it('lists only the requesting tenant’s templates', async () => {
    const listed = await listTemplates(A);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('t-a');
  });

  it('refuses to delete another tenant’s template', async () => {
    expect(await deleteTemplate({ tenantId: B, id: 't-a' })).toBe(0);
    expect(whatsAppTemplate.__rows()).toHaveLength(2);
  });

  it('does not let one tenant send using another tenant’s approved template', async () => {
    whatsAppTemplate.__seed([
      { id: 't-a', tenantId: A, name: 'promo', language: 'he', metaStatus: 'Approved' },
    ]);

    await expect(
      assertTemplateSendable({ tenantId: B, name: 'promo', language: 'he' }),
    ).rejects.toMatchObject({ code: 'TemplateNotFound' });
  });
});

describe('template approval gate', () => {
  it.each(['Draft', 'Pending', 'Rejected', 'Disabled'])(
    'refuses to send a template whose Meta status is %s',
    async (metaStatus) => {
      whatsAppTemplate.__seed([{ id: 't', tenantId: A, name: 'x', language: 'he', metaStatus }]);

      const error = await assertTemplateSendable({ tenantId: A, name: 'x', language: 'he' }).catch((e) => e);
      expect(error).toBeInstanceOf(WhatsAppError);
      expect(error.code).toBe('TemplateNotApproved');
    },
  );

  it('allows a template Meta has approved', async () => {
    whatsAppTemplate.__seed([{ id: 't', tenantId: A, name: 'x', language: 'he', metaStatus: 'Approved' }]);
    await expect(assertTemplateSendable({ tenantId: A, name: 'x', language: 'he' })).resolves.toMatchObject({
      name: 'x',
    });
  });
});
