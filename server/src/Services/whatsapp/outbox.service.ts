/**
 * Transactional outbox for outgoing WhatsApp messages (§16, §17, §27).
 *
 * Business code NEVER calls the provider directly. It enqueues here inside (or right
 * after) its own transaction; the worker drains the queue separately. That way a
 * rolled-back booking update can never leave a message already delivered.
 *
 * Concurrency: claiming uses a single conditional UPDATE guarded by the row's current
 * status, so two workers racing for the same row produce exactly one winner. Postgres
 * applies row locks for the UPDATE, and the `status = 'Pending'` predicate is
 * re-evaluated against the committed row, so the loser matches zero rows.
 */

import type { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { getWhatsAppConfig, type WhatsAppRetryConfig } from '../../config/whatsapp.config';
import { logger } from '../../utils/logger';
import { recordWhatsAppMetric } from './metrics';
import type { OutboxStatus, SendRequest, SendableType } from './types';

/** Identifies this worker instance in `claimedBy`. */
export const WORKER_ID = `${process.env.HOSTNAME || 'local'}:${process.pid}`;

/** A claim older than this is considered abandoned (worker crashed mid-send). */
const CLAIM_TIMEOUT_MS = Number(process.env.WHATSAPP_CLAIM_TIMEOUT_MS ?? 5 * 60 * 1000);

export type EnqueueParams = {
  tenantId: string;
  toPhone: string;
  request: SendRequest;
  conversationId?: string | null;
  messageId?: string | null;
  bookingId?: string | null;
  /**
   * Makes enqueue idempotent within a tenant. Reuse a stable business key
   * (e.g. `contract-signed:<bookingId>`) so a retried business operation cannot
   * queue the same message twice.
   */
  dedupeKey?: string | null;
  maxAttempts?: number;
  /** Delay the first attempt (e.g. a scheduled reminder). */
  notBefore?: Date;
};

function sendableTypeOf(request: SendRequest): SendableType {
  return request.kind;
}

/**
 * Add a message to the outbox.
 *
 * Pass `tx` to enlist in the caller's transaction — that is what makes this an
 * outbox rather than a queue: the row and the business change commit together.
 */
export async function enqueueOutboxMessage(
  params: EnqueueParams,
  // `tx` is the client handed to a `$transaction` callback. It is typed as
  // `unknown` because Prisma gives the extended client and the transaction client
  // structurally different (and non-assignable) types, even though both expose the
  // same model methods. Passing anything else here is a programming error.
  tx?: unknown,
): Promise<{ id: string; deduplicated: boolean }> {
  const client = (tx ?? prisma) as typeof prisma;

  if (params.dedupeKey) {
    const existing = await client.whatsAppOutboxMessage.findUnique({
      where: { tenantId_dedupeKey: { tenantId: params.tenantId, dedupeKey: params.dedupeKey } },
      select: { id: true },
    });
    if (existing) {
      logger.debug('WhatsApp outbox enqueue deduplicated', {
        tenantId: params.tenantId,
        dedupeKey: params.dedupeKey,
      });
      return { id: existing.id, deduplicated: true };
    }
  }

  const config = getWhatsAppConfig();

  try {
    const row = await client.whatsAppOutboxMessage.create({
      data: {
        tenantId: params.tenantId,
        conversationId: params.conversationId ?? null,
        messageId: params.messageId ?? null,
        bookingId: params.bookingId ?? null,
        toPhone: params.toPhone,
        messageType: sendableTypeOf(params.request),
        templateName: params.request.kind === 'template' ? params.request.templateName : null,
        templateLanguage: params.request.kind === 'template' ? params.request.languageCode : null,
        payload: params.request as unknown as Prisma.InputJsonValue,
        status: 'Pending' satisfies OutboxStatus,
        maxAttempts: params.maxAttempts ?? config.retry.maxAttempts,
        nextAttemptAt: params.notBefore ?? new Date(),
        dedupeKey: params.dedupeKey ?? null,
      },
      select: { id: true },
    });

    recordWhatsAppMetric('whatsapp_outbox_enqueued');
    logger.info('WhatsApp message enqueued', {
      tenantId: params.tenantId,
      outboxId: row.id,
      messageType: params.request.kind,
      dedupeKey: params.dedupeKey ?? undefined,
    });
    return { id: row.id, deduplicated: false };
  } catch (error) {
    // Lost a race on the dedupe key — treat as already enqueued.
    if ((error as { code?: string }).code === 'P2002' && params.dedupeKey) {
      const raced = await client.whatsAppOutboxMessage.findUnique({
        where: { tenantId_dedupeKey: { tenantId: params.tenantId, dedupeKey: params.dedupeKey } },
        select: { id: true },
      });
      if (raced) return { id: raced.id, deduplicated: true };
    }
    throw error;
  }
}

/**
 * Atomically claim up to `limit` due messages for this worker.
 *
 * Each row is claimed with its own conditional update; rows lost to another worker
 * simply return count 0 and are skipped. No SELECT-then-UPDATE race.
 */
export async function claimDueMessages(limit?: number): Promise<string[]> {
  const config = getWhatsAppConfig();
  const batchSize = limit ?? config.outboxBatchSize;
  const now = new Date();

  const candidates = await prisma.whatsAppOutboxMessage.findMany({
    where: { status: 'Pending', nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: batchSize,
    select: { id: true },
  });

  const claimed: string[] = [];
  for (const candidate of candidates) {
    const result = await prisma.whatsAppOutboxMessage.updateMany({
      // The status predicate is the lock: only one worker can flip Pending->Processing.
      where: { id: candidate.id, status: 'Pending' },
      data: {
        status: 'Processing',
        claimedBy: WORKER_ID,
        claimedAt: now,
        lastAttemptAt: now,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 1) claimed.push(candidate.id);
  }

  return claimed;
}

/**
 * Return rows stuck in Processing by a worker that died, so they can be retried.
 * Safe because a crashed worker cannot still be mid-send after the timeout.
 */
export async function releaseStaleClaims(): Promise<number> {
  const cutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  const result = await prisma.whatsAppOutboxMessage.updateMany({
    where: { status: 'Processing', claimedAt: { lt: cutoff } },
    data: { status: 'Pending', claimedBy: null, claimedAt: null },
  });
  if (result.count > 0) {
    logger.warn('Released stale WhatsApp outbox claims', { count: result.count });
  }
  return result.count;
}

/** Exponential backoff with jitter, capped at maxDelay. */
export function computeBackoffMs(
  attempt: number,
  retry: WhatsAppRetryConfig,
  retryAfterSec?: number,
): number {
  // The provider's own Retry-After always wins — respect throttling (§43).
  if (retryAfterSec && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, retry.maxDelayMs);
  }
  const exponential = retry.initialDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, retry.maxDelayMs);
  const jitter = capped * retry.jitterRatio * (Math.random() * 2 - 1);
  return Math.max(1000, Math.round(capped + jitter));
}

export async function markOutboxSent(params: {
  outboxId: string;
  externalMessageId: string;
}): Promise<void> {
  await prisma.whatsAppOutboxMessage.update({
    where: { id: params.outboxId },
    data: {
      status: 'Sent',
      sentAt: new Date(),
      externalMessageId: params.externalMessageId,
      claimedBy: null,
      claimedAt: null,
      lastError: null,
      lastErrorCode: null,
    },
  });
}

/**
 * Record a failed attempt.
 *
 * Retryable AND attempts remaining -> back to Pending with backoff.
 * Otherwise -> Failed, permanently. There is no path that retries forever (§17).
 */
export async function markOutboxAttemptFailed(params: {
  outboxId: string;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  retryAfterSec?: number;
}): Promise<{ status: OutboxStatus; nextAttemptAt: Date | null }> {
  const config = getWhatsAppConfig();
  const row = await prisma.whatsAppOutboxMessage.findUnique({
    where: { id: params.outboxId },
    select: { attempts: true, maxAttempts: true, tenantId: true },
  });
  if (!row) return { status: 'Failed', nextAttemptAt: null };

  const exhausted = row.attempts >= row.maxAttempts;
  const willRetry = params.retryable && !exhausted;

  const nextAttemptAt = willRetry
    ? new Date(Date.now() + computeBackoffMs(row.attempts, config.retry, params.retryAfterSec))
    : null;

  await prisma.whatsAppOutboxMessage.update({
    where: { id: params.outboxId },
    data: {
      status: willRetry ? 'Pending' : 'Failed',
      claimedBy: null,
      claimedAt: null,
      lastErrorCode: params.errorCode,
      lastError: params.errorMessage.slice(0, 2000),
      ...(nextAttemptAt ? { nextAttemptAt } : {}),
    },
  });

  recordWhatsAppMetric(willRetry ? 'whatsapp_outbox_retry' : 'whatsapp_outbox_dead');
  logger.warn('WhatsApp outbox attempt failed', {
    tenantId: row.tenantId,
    outboxId: params.outboxId,
    errorCode: params.errorCode,
    attempt: row.attempts,
    maxAttempts: row.maxAttempts,
    retryable: params.retryable,
    willRetry,
    nextAttemptAt: nextAttemptAt?.toISOString(),
  });

  return { status: willRetry ? 'Pending' : 'Failed', nextAttemptAt };
}

/** Operator action: stop a message that has not been sent yet. */
export async function cancelOutboxMessage(params: {
  tenantId: string;
  outboxId: string;
}): Promise<number> {
  const result = await prisma.whatsAppOutboxMessage.updateMany({
    where: { id: params.outboxId, tenantId: params.tenantId, status: { in: ['Pending', 'Failed'] } },
    data: { status: 'Cancelled', claimedBy: null, claimedAt: null },
  });
  return result.count;
}

/** Queue depth for health checks and the settings screen. */
export async function getOutboxStats(tenantId?: string): Promise<Record<string, number>> {
  const grouped = await prisma.whatsAppOutboxMessage.groupBy({
    by: ['status'],
    where: tenantId ? { tenantId } : undefined,
    _count: { _all: true },
  });
  const rows = grouped as unknown as { status: string; _count: { _all: number } }[];
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
}
