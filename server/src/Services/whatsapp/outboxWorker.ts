/**
 * Outbox worker (§26).
 *
 * Idempotent: work is claimed atomically, so a second instance running concurrently
 * cannot send the same row twice. Safe to run on every app instance.
 */

import prisma from '../../config/prisma';
import { getWhatsAppConfig } from '../../config/whatsapp.config';
import { logger } from '../../utils/logger';
import { markMessageFailed, markMessageSent } from './message.service';
import {
  claimDueMessages,
  markOutboxAttemptFailed,
  markOutboxSent,
  releaseStaleClaims,
} from './outbox.service';
import { getWhatsAppProvider } from './providers';
import type { SendRequest } from './types';

export type OutboxRunSummary = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  released: number;
  skipped: boolean;
};

async function processOne(outboxId: string): Promise<'sent' | 'retried' | 'failed'> {
  const row = await prisma.whatsAppOutboxMessage.findUnique({ where: { id: outboxId } });
  if (!row) return 'failed';

  const provider = getWhatsAppProvider();
  const request = row.payload as unknown as SendRequest;

  const result = await provider.sendAsync(request);

  if (result.ok) {
    await markOutboxSent({ outboxId, externalMessageId: result.externalMessageId });
    if (row.messageId) {
      await markMessageSent({ messageId: row.messageId, externalMessageId: result.externalMessageId });
    }
    return 'sent';
  }

  const outcome = await markOutboxAttemptFailed({
    outboxId,
    errorCode: result.code,
    errorMessage: result.message,
    retryable: result.retryable,
    retryAfterSec: result.retryAfterSec,
  });

  // Only surface the failure on the message ledger once retries are exhausted,
  // so the UI does not flap between Pending and Failed.
  if (outcome.status === 'Failed' && row.messageId) {
    await markMessageFailed({
      messageId: row.messageId,
      errorCode: result.code,
      errorMessage: result.message,
    });
  }

  return outcome.status === 'Failed' ? 'failed' : 'retried';
}

/** One tick of the worker. Returns a summary for logging/tests. */
export async function runWhatsAppOutboxWorker(limit?: number): Promise<OutboxRunSummary> {
  const config = getWhatsAppConfig();
  const summary: OutboxRunSummary = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    released: 0,
    skipped: false,
  };

  if (!config.enabled) {
    summary.skipped = true;
    return summary;
  }

  summary.released = await releaseStaleClaims();

  const claimed = await claimDueMessages(limit);
  summary.claimed = claimed.length;
  if (claimed.length === 0) return summary;

  for (const outboxId of claimed) {
    try {
      const outcome = await processOne(outboxId);
      if (outcome === 'sent') summary.sent += 1;
      else if (outcome === 'retried') summary.retried += 1;
      else summary.failed += 1;
    } catch (error) {
      // An unexpected throw must not leave the row claimed forever.
      summary.failed += 1;
      logger.error('Unexpected error while processing WhatsApp outbox row', { outboxId, error });
      await markOutboxAttemptFailed({
        outboxId,
        errorCode: 'UnknownError',
        errorMessage: error instanceof Error ? error.message : 'unknown',
        retryable: true,
      }).catch(() => undefined);
    }
  }

  logger.info('WhatsApp outbox worker tick complete', summary);
  return summary;
}

/** Retention: drop processed webhook envelopes past the configured age (§44). */
export async function cleanupWhatsAppWebhookEvents(): Promise<number> {
  const { webhookRetentionDays } = getWhatsAppConfig();
  if (webhookRetentionDays <= 0) return 0;

  const cutoff = new Date(Date.now() - webhookRetentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.whatsAppWebhookEvent.deleteMany({
    where: { status: { in: ['Processed', 'Ignored'] }, receivedAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    logger.info('Cleaned up old WhatsApp webhook events', { count: result.count, cutoff });
  }
  return result.count;
}
