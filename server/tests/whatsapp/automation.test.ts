/**
 * Automation engine (§25, §37) — rules drive behaviour, nothing is hard-coded,
 * and a disabled rule never sends.
 */

jest.mock('../../src/config/prisma', () => jest.requireActual('../helpers/whatsappPrismaMock'));

import {
  resetWhatsAppPrismaMock,
  booking,
  whatsAppAutomationRule,
  whatsAppConversation,
  whatsAppOutboxMessage,
  whatsAppTemplate,
} from '../helpers/whatsappPrismaMock';
import { runTrigger, listAutomationHandlers } from '../../src/Services/whatsapp/automation/registry';
import { renderTemplateText } from '../../src/Services/whatsapp/automation/helpers';
import { REQUIREMENT_CHECKS } from '../../src/Services/whatsapp/automation/handlers/eventApproaching';

const TENANT = 'tenant-a';

function seedRule(overrides: Record<string, unknown> = {}) {
  whatsAppAutomationRule.__seed([
    {
      id: 'rule-1',
      tenantId: TENANT,
      name: 'contract confirmation',
      triggerType: 'ContractSigned',
      triggerConfiguration: {},
      templateId: 'tpl-1',
      actionType: 'SendWhatsAppToCustomer',
      actionConfiguration: {},
      isEnabled: true,
      createdAt: new Date(),
      ...overrides,
    },
  ]);
}

function seedSignedBooking(overrides: Record<string, unknown> = {}) {
  booking.__seed([
    {
      id: 'booking-1',
      tenantId: TENANT,
      eventCode: 'EVT-1',
      clientAFullName: 'ישראל ישראלי',
      clientAPhone: '050-1234567',
      clientBPhone: null,
      guestCount: 250,
      totalPrice: 80000,
      eventType: 'wedding',
      isContractSigned: true,
      updatedAt: new Date(),
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  resetWhatsAppPrismaMock();
  process.env.WHATSAPP_ENABLED = 'true';
  process.env.WHATSAPP_PROVIDER = 'fake';
  process.env.WHATSAPP_AUTOMATION_ENABLED = 'true';
  whatsAppTemplate.__seed([
    {
      id: 'tpl-1',
      tenantId: TENANT,
      name: 'contract_signed',
      language: 'he',
      metaStatus: 'Approved',
      parameters: [
        { position: 1, key: 'customerName' },
        { position: 2, key: 'eventDate' },
      ],
    },
  ]);
});

afterEach(() => {
  delete process.env.WHATSAPP_ENABLED;
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.WHATSAPP_AUTOMATION_ENABLED;
});

describe('registry', () => {
  it('exposes every trigger with a description', () => {
    const handlers = listAutomationHandlers();
    expect(handlers.map((h) => h.trigger).sort()).toEqual([
      'ContractSigned',
      'EventApproaching',
      'IncomingMessage',
      'PaymentOverdue',
      'ProductionFormReady',
    ]);
    expect(handlers.every((h) => h.description.length > 0)).toBe(true);
  });

  it('does nothing while automation is switched off', async () => {
    process.env.WHATSAPP_AUTOMATION_ENABLED = 'false';
    seedRule();
    seedSignedBooking();

    const result = await runTrigger('ContractSigned', { tenantId: TENANT, bookingId: 'booking-1' });
    expect(result.rulesEvaluated).toBe(0);
    expect(whatsAppOutboxMessage.__rows()).toHaveLength(0);
  });

  it('ignores a disabled rule', async () => {
    seedRule({ isEnabled: false });
    seedSignedBooking();

    const result = await runTrigger('ContractSigned', { tenantId: TENANT, bookingId: 'booking-1' });
    expect(result.rulesEvaluated).toBe(0);
    expect(whatsAppOutboxMessage.__rows()).toHaveLength(0);
  });

  it('never runs another tenant’s rules', async () => {
    seedRule({ tenantId: 'tenant-b' });
    seedSignedBooking();

    const result = await runTrigger('ContractSigned', { tenantId: TENANT, bookingId: 'booking-1' });
    expect(result.rulesEvaluated).toBe(0);
  });
});

describe('ContractSigned', () => {
  it('queues a WhatsApp message when the contract is fully signed', async () => {
    seedRule();
    seedSignedBooking();

    const result = await runTrigger('ContractSigned', { tenantId: TENANT, bookingId: 'booking-1' });

    expect(result.actionsQueued).toBe(1);
    expect(whatsAppOutboxMessage.__rows()[0]).toMatchObject({
      messageType: 'template',
      templateName: 'contract_signed',
      toPhone: '972501234567',
      bookingId: 'booking-1',
    });
  });

  it('re-checks isContractSigned instead of trusting the caller', async () => {
    seedRule();
    seedSignedBooking({ isContractSigned: false });

    const result = await runTrigger('ContractSigned', { tenantId: TENANT, bookingId: 'booking-1' });
    expect(result.actionsQueued).toBe(0);
    expect(result.details).toContain('contract-not-fully-signed');
  });

  it('does not send twice for the same booking', async () => {
    seedRule();
    seedSignedBooking();

    await runTrigger('ContractSigned', { tenantId: TENANT, bookingId: 'booking-1' });
    await runTrigger('ContractSigned', { tenantId: TENANT, bookingId: 'booking-1' });

    expect(whatsAppOutboxMessage.__rows()).toHaveLength(1);
  });

  it('skips a booking with no usable phone number', async () => {
    seedRule();
    seedSignedBooking({ clientAPhone: 'n/a' });

    const result = await runTrigger('ContractSigned', { tenantId: TENANT, bookingId: 'booking-1' });
    expect(result.actionsQueued).toBe(0);
    expect(result.details).toContain('no-valid-phone');
  });

  it('will not reach a booking in another tenant', async () => {
    seedRule();
    seedSignedBooking({ tenantId: 'tenant-b' });

    const result = await runTrigger('ContractSigned', { tenantId: TENANT, bookingId: 'booking-1' });
    expect(result.details).toContain('booking-not-found-in-tenant');
  });
});

describe('IncomingMessage', () => {
  beforeEach(() => {
    whatsAppConversation.__seed([
      { id: 'conv-1', tenantId: TENANT, phoneNumber: '972529998888', lastInboundAt: new Date() },
    ]);
  });

  it('notifies the manager using the rule’s configured body', async () => {
    process.env.MANAGER_ALERT_PHONE = '0509999999';
    whatsAppAutomationRule.__seed([
      {
        id: 'rule-inbound',
        tenantId: TENANT,
        name: 'forward to manager',
        triggerType: 'IncomingMessage',
        triggerConfiguration: { notifyManager: true },
        templateId: null,
        actionConfiguration: { bodyTemplate: 'הודעה מ-{{fromPhone}}: {{messageText}}' },
        isEnabled: true,
        createdAt: new Date(),
      },
    ]);
    // The manager conversation needs an open window for a free-form forward.
    await whatsAppConversation.create({
      data: { tenantId: TENANT, phoneNumber: '972509999999', lastInboundAt: new Date() },
    });

    const result = await runTrigger('IncomingMessage', {
      tenantId: TENANT,
      conversationId: 'conv-1',
      externalMessageId: 'wamid.IN1',
      bookingId: null,
      fromPhone: '972529998888',
      text: 'מתי האירוע?',
      messageType: 'text',
      profileName: 'דנה',
      isKnownCustomer: false,
    });

    expect(result.actionsQueued).toBe(1);
    const queued = whatsAppOutboxMessage.__rows()[0];
    expect(queued.toPhone).toBe('972509999999');
    expect((queued.payload as { body: string }).body).toBe('הודעה מ-972529998888: מתי האירוע?');
    delete process.env.MANAGER_ALERT_PHONE;
  });

  it('does not forward the same inbound message twice', async () => {
    process.env.MANAGER_ALERT_PHONE = '0509999999';
    whatsAppAutomationRule.__seed([
      {
        id: 'rule-inbound',
        tenantId: TENANT,
        name: 'forward',
        triggerType: 'IncomingMessage',
        triggerConfiguration: { notifyManager: true },
        actionConfiguration: { bodyTemplate: '{{messageText}}' },
        isEnabled: true,
        createdAt: new Date(),
      },
    ]);
    await whatsAppConversation.create({
      data: { tenantId: TENANT, phoneNumber: '972509999999', lastInboundAt: new Date() },
    });

    const context = {
      tenantId: TENANT,
      conversationId: 'conv-1',
      externalMessageId: 'wamid.IN1',
      bookingId: null,
      fromPhone: '972529998888',
      text: 'hi',
      messageType: 'text',
      profileName: null,
      isKnownCustomer: false,
    };

    await runTrigger('IncomingMessage', context);
    await runTrigger('IncomingMessage', context);

    expect(whatsAppOutboxMessage.__rows()).toHaveLength(1);
    delete process.env.MANAGER_ALERT_PHONE;
  });
});

describe('renderTemplateText', () => {
  it('substitutes placeholders', () => {
    expect(renderTemplateText('שלום {{name}}, ב-{{date}}', { name: 'דנה', date: '01/01' })).toBe(
      'שלום דנה, ב-01/01',
    );
  });

  it('renders a missing value as an em dash rather than "undefined"', () => {
    expect(renderTemplateText('{{missing}}', {})).toBe('—');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplateText('{{ name }}', { name: 'X' })).toBe('X');
  });
});

describe('EventApproaching requirement checks', () => {
  it('mirrors the checks the existing morning cron already uses', () => {
    expect(Object.keys(REQUIREMENT_CHECKS)).toEqual(
      expect.arrayContaining(['tablecloth', 'finalGuestCount', 'kashrut']),
    );
  });

  it('treats a missing production form as every requirement being missing', () => {
    expect(REQUIREMENT_CHECKS.productionForm.isMissing(null)).toBe(true);
    expect(REQUIREMENT_CHECKS.tablecloth.isMissing(null)).toBe(true);
    expect(REQUIREMENT_CHECKS.finalGuestCount.isMissing(null)).toBe(true);
  });

  it('needs both tablecloth and napkin to count as complete', () => {
    expect(REQUIREMENT_CHECKS.tablecloth.isMissing({ tableclothId: 'a', napkinId: null })).toBe(true);
    expect(REQUIREMENT_CHECKS.tablecloth.isMissing({ tableclothId: 'a', napkinId: 'b' })).toBe(false);
  });

  it('treats a zero guest count as not yet chosen', () => {
    expect(REQUIREMENT_CHECKS.finalGuestCount.isMissing({ finalGuestCount: 0 })).toBe(true);
    expect(REQUIREMENT_CHECKS.finalGuestCount.isMissing({ finalGuestCount: 250 })).toBe(false);
  });
});
