/**
 * Outbox lifecycle, retry policy and concurrency protection (§16, §17, §27, §37).
 */

jest.mock('../../src/config/prisma', () => jest.requireActual('../helpers/whatsappPrismaMock'));

import prisma from '../../src/config/prisma';
import {
  resetWhatsAppPrismaMock,
  whatsAppOutboxMessage,
} from '../helpers/whatsappPrismaMock';
import {
  claimDueMessages,
  enqueueOutboxMessage,
  markOutboxAttemptFailed,
  markOutboxSent,
  cancelOutboxMessage,
  getOutboxStats,
  releaseStaleClaims,
} from '../../src/Services/whatsapp/outbox.service';
import { runWhatsAppOutboxWorker } from '../../src/Services/whatsapp/outboxWorker';
import { FakeWhatsAppProvider } from '../../src/Services/whatsapp/providers/fakeProvider';
import {
  resetWhatsAppProviderCache,
  setWhatsAppProviderForTesting,
} from '../../src/Services/whatsapp/providers';

const TENANT = 'tenant-a';
const textRequest = { kind: 'text' as const, to: '972501234567', body: 'hello' };

function enqueue(overrides: Record<string, unknown> = {}) {
  return enqueueOutboxMessage({
    tenantId: TENANT,
    toPhone: '972501234567',
    request: textRequest,
    ...overrides,
  });
}

describe('WhatsApp outbox', () => {
  let provider: FakeWhatsAppProvider;

  beforeEach(() => {
    resetWhatsAppPrismaMock();
    resetWhatsAppProviderCache();
    provider = new FakeWhatsAppProvider();
    setWhatsAppProviderForTesting(provider);
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'fake';
    process.env.WHATSAPP_RETRY_MAX_ATTEMPTS = '3';
  });

  afterEach(() => {
    setWhatsAppProviderForTesting(null);
    delete process.env.WHATSAPP_ENABLED;
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.WHATSAPP_RETRY_MAX_ATTEMPTS;
  });

  describe('enqueue', () => {
    it('creates a Pending row due immediately', async () => {
      const { id, deduplicated } = await enqueue();
      expect(deduplicated).toBe(false);

      const row = whatsAppOutboxMessage.__rows().find((r) => r.id === id);
      expect(row).toMatchObject({ status: 'Pending', attempts: 0, tenantId: TENANT, messageType: 'text' });
    });

    it('is idempotent for the same dedupe key', async () => {
      const first = await enqueue({ dedupeKey: 'contract-signed:booking-1' });
      const second = await enqueue({ dedupeKey: 'contract-signed:booking-1' });

      expect(second.deduplicated).toBe(true);
      expect(second.id).toBe(first.id);
      expect(whatsAppOutboxMessage.__rows()).toHaveLength(1);
    });

    it('does not deduplicate the same key across different tenants', async () => {
      await enqueue({ dedupeKey: 'k' });
      await enqueueOutboxMessage({
        tenantId: 'tenant-b',
        toPhone: '972501234567',
        request: textRequest,
        dedupeKey: 'k',
      });
      expect(whatsAppOutboxMessage.__rows()).toHaveLength(2);
    });

    it('honours notBefore for scheduled sends', async () => {
      const future = new Date(Date.now() + 60_000);
      const { id } = await enqueue({ notBefore: future });
      expect(await claimDueMessages()).not.toContain(id);
    });
  });

  describe('claiming', () => {
    it('moves a claimed row to Processing and increments attempts', async () => {
      const { id } = await enqueue();
      expect(await claimDueMessages()).toEqual([id]);

      const row = whatsAppOutboxMessage.__rows()[0];
      expect(row.status).toBe('Processing');
      expect(row.attempts).toBe(1);
      expect(row.claimedBy).toBeTruthy();
    });

    it('never hands the same row to two workers', async () => {
      await enqueue();
      const first = await claimDueMessages();
      const second = await claimDueMessages();

      expect(first).toHaveLength(1);
      // The status predicate on the conditional UPDATE is what makes this safe.
      expect(second).toHaveLength(0);
    });

    it('claims each row exactly once under a concurrent race', async () => {
      await Promise.all([enqueue({ dedupeKey: 'a' }), enqueue({ dedupeKey: 'b' })]);

      const [runA, runB, runC] = await Promise.all([
        claimDueMessages(),
        claimDueMessages(),
        claimDueMessages(),
      ]);

      const all = [...runA, ...runB, ...runC];
      expect(all).toHaveLength(2);
      expect(new Set(all).size).toBe(2);
    });

    it('releases claims abandoned by a crashed worker', async () => {
      const { id } = await enqueue();
      await claimDueMessages();

      await prisma.whatsAppOutboxMessage.update({
        where: { id },
        data: { claimedAt: new Date(Date.now() - 10 * 60 * 1000) },
      });

      expect(await releaseStaleClaims()).toBe(1);
      expect(whatsAppOutboxMessage.__rows()[0]).toMatchObject({ status: 'Pending', claimedBy: null });
    });

    it('does not release a claim that is still fresh', async () => {
      await enqueue();
      await claimDueMessages();
      expect(await releaseStaleClaims()).toBe(0);
    });
  });

  describe('outcomes', () => {
    it('Pending -> Processing -> Sent on success', async () => {
      const { id } = await enqueue();
      await claimDueMessages();
      await markOutboxSent({ outboxId: id, externalMessageId: 'wamid.OUT' });

      expect(whatsAppOutboxMessage.__rows()[0]).toMatchObject({
        status: 'Sent',
        externalMessageId: 'wamid.OUT',
        claimedBy: null,
      });
    });

    it('Pending -> Processing -> Pending with backoff on a retryable failure', async () => {
      const { id } = await enqueue();
      await claimDueMessages();

      const outcome = await markOutboxAttemptFailed({
        outboxId: id,
        errorCode: 'ProviderUnavailable',
        errorMessage: 'HTTP 503',
        retryable: true,
      });

      expect(outcome.status).toBe('Pending');
      expect(outcome.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
      expect(whatsAppOutboxMessage.__rows()[0].lastErrorCode).toBe('ProviderUnavailable');
    });

    it('Pending -> Processing -> Failed immediately on a permanent failure', async () => {
      const { id } = await enqueue();
      await claimDueMessages();

      const outcome = await markOutboxAttemptFailed({
        outboxId: id,
        errorCode: 'InvalidPhoneNumber',
        errorMessage: 'not a whatsapp user',
        retryable: false,
      });

      expect(outcome.status).toBe('Failed');
      expect(outcome.nextAttemptAt).toBeNull();
      // One attempt, then done — no retry loop for a permanent error.
      expect(whatsAppOutboxMessage.__rows()[0].attempts).toBe(1);
    });

    it('stops retrying once the attempt budget is exhausted', async () => {
      const { id } = await enqueue({ maxAttempts: 3 });

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await prisma.whatsAppOutboxMessage.update({
          where: { id },
          data: { status: 'Pending', nextAttemptAt: new Date(Date.now() - 1000) },
        });
        await claimDueMessages();
        await markOutboxAttemptFailed({
          outboxId: id,
          errorCode: 'NetworkError',
          errorMessage: 'timeout',
          retryable: true,
        });
      }

      const row = whatsAppOutboxMessage.__rows()[0];
      expect(row.attempts).toBe(3);
      expect(row.status).toBe('Failed');
      expect(await claimDueMessages()).toHaveLength(0);
    });

    it('cancels a queued message before it is sent', async () => {
      const { id } = await enqueue();
      expect(await cancelOutboxMessage({ tenantId: TENANT, outboxId: id })).toBe(1);
      expect(whatsAppOutboxMessage.__rows()[0].status).toBe('Cancelled');
    });

    it('refuses to cancel another tenant’s message', async () => {
      const { id } = await enqueue();
      expect(await cancelOutboxMessage({ tenantId: 'tenant-b', outboxId: id })).toBe(0);
      expect(whatsAppOutboxMessage.__rows()[0].status).toBe('Pending');
    });

    it('reports queue depth by status', async () => {
      await enqueue({ dedupeKey: '1' });
      const { id } = await enqueue({ dedupeKey: '2' });
      await claimDueMessages();
      await markOutboxSent({ outboxId: id, externalMessageId: 'wamid.X' });

      const stats = await getOutboxStats(TENANT);
      expect(stats.Sent).toBe(1);
    });
  });

  describe('worker', () => {
    it('sends a queued message through the provider', async () => {
      await enqueue();
      const summary = await runWhatsAppOutboxWorker();

      expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0, retried: 0 });
      expect(provider.getSentMessages()).toHaveLength(1);
      expect(whatsAppOutboxMessage.__rows()[0].status).toBe('Sent');
    });

    it('schedules a retry when the provider is temporarily unavailable', async () => {
      await enqueue();
      provider.failNext({ code: 'ProviderUnavailable', message: 'HTTP 503', retryable: true });

      const summary = await runWhatsAppOutboxWorker();
      expect(summary).toMatchObject({ retried: 1, sent: 0 });
      expect(whatsAppOutboxMessage.__rows()[0].status).toBe('Pending');
    });

    it('fails permanently without retrying an invalid number', async () => {
      await enqueue();
      provider.failNext({ code: 'InvalidPhoneNumber', message: 'bad number', retryable: false });

      const summary = await runWhatsAppOutboxWorker();
      expect(summary).toMatchObject({ failed: 1, retried: 0 });
      expect(whatsAppOutboxMessage.__rows()[0].status).toBe('Failed');
    });

    it('sends nothing at all while the integration is disabled', async () => {
      process.env.WHATSAPP_ENABLED = 'false';
      await enqueue();

      const summary = await runWhatsAppOutboxWorker();
      expect(summary.skipped).toBe(true);
      expect(provider.getSentMessages()).toHaveLength(0);
    });

    it('does not send a message twice when two workers run concurrently', async () => {
      await enqueue();
      await Promise.all([runWhatsAppOutboxWorker(), runWhatsAppOutboxWorker()]);
      expect(provider.getSentMessages()).toHaveLength(1);
    });
  });
});
