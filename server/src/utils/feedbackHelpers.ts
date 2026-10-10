import { randomUUID } from 'crypto';
import prisma from '../config/prisma';
import { mailFailureMessage, sendFeedbackRequestEmail } from './mailer';
import { toCalendarDateKey } from './dateLocal';
import { sendFeedbackRequestWhatsApp } from './whatsapp';
import { logger } from './logger';
import { emitFeedbackUpdated } from './realtime';
import {
  FEEDBACK_ELIGIBLE_EVENT_STATUSES,
  FEEDBACK_MAX_NOTIFY_ATTEMPTS,
  eventEndDateTime,
  feedbackDueAt,
  feedbackScanWindow,
  hasEventEndedAt,
  isFeedbackDue,
  retryCutoff,
} from './feedbackSchedule';

/** Event types that receive feedback requests for both client sides. */
export const DUAL_SIDE_EVENT_TYPES = new Set(['חתונה', 'אירוסין']);

export function isDualSideEvent(eventType?: string | null): boolean {
  return DUAL_SIDE_EVENT_TYPES.has((eventType || '').trim());
}

export function hasContact(info: { phone?: string | null; email?: string | null }): boolean {
  return !!(info.phone?.trim() || info.email?.trim());
}

export function primaryPhone(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  return raw.split(' | ')[0]?.trim() || null;
}

export function computeCombinedAverage(scores: (number | null | undefined)[]): number | null {
  const valid = scores.filter((s): s is number => typeof s === 'number' && !Number.isNaN(s));
  if (valid.length === 0) return null;
  return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
}

export type FeedbackSideInput = {
  side: 'A' | 'B';
  name: string;
  phone?: string | null;
  email?: string | null;
};

export function buildFeedbackSides(booking: {
  eventType: string;
  clientAFullName: string;
  clientAPhone: string;
  clientAEmail?: string | null;
  clientBFullName?: string | null;
  clientBPhone?: string | null;
  clientBEmail?: string | null;
}): FeedbackSideInput[] {
  const sides: FeedbackSideInput[] = [];

  if (hasContact({ phone: booking.clientAPhone, email: booking.clientAEmail })) {
    sides.push({
      side: 'A',
      name: booking.clientAFullName,
      phone: booking.clientAPhone,
      email: booking.clientAEmail,
    });
  }

  if (
    isDualSideEvent(booking.eventType) &&
    booking.clientBFullName?.trim() &&
    hasContact({ phone: booking.clientBPhone, email: booking.clientBEmail })
  ) {
    sides.push({
      side: 'B',
      name: booking.clientBFullName,
      phone: booking.clientBPhone,
      email: booking.clientBEmail,
    });
  }

  return sides;
}

export function isLocalClientUrl(url?: string): boolean {
  const value = (url ?? process.env.CLIENT_URL ?? 'http://localhost:5173').toLowerCase();
  return value.includes('localhost') || value.includes('127.0.0.1') || value.includes('0.0.0.0');
}

export function getClientFeedbackUrl(token: string): string {
  const baseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  if (isLocalClientUrl(baseUrl)) {
    logger.warn(
      'CLIENT_URL is local — feedback links in emails will not work for external customers. Set CLIENT_URL to a public URL.',
    );
  }
  return `${baseUrl}/feedback/${token}`;
}

/* -------------------------------------------------------------------------- */
/* Injectable dependencies — production defaults, overridable from tests.      */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type FeedbackDbClient = {
  booking: {
    findMany: (args: any) => Promise<any[]>;
  };
  feedback: {
    findMany: (args: any) => Promise<any[]>;
    createMany: (args: any) => Promise<any>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Structural logger interface — deliberately not `Pick<typeof logger, …>`, whose
 * winston signatures are chainable and awkward to satisfy from a test double.
 * The real winston logger satisfies this (a method returning Logger is assignable
 * to one returning void).
 */
export type FeedbackLogger = {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
};

export type FeedbackDispatchDeps = {
  db?: FeedbackDbClient;
  sendEmail?: typeof sendFeedbackRequestEmail;
  sendWhatsApp?: typeof sendFeedbackRequestWhatsApp;
  log?: FeedbackLogger;
  emitUpdated?: (payload: { bookingId: string }) => void;
  now?: Date;
};

type ResolvedDeps = {
  db: FeedbackDbClient;
  sendEmail: typeof sendFeedbackRequestEmail;
  sendWhatsApp: typeof sendFeedbackRequestWhatsApp;
  log: FeedbackLogger;
  emitUpdated: (payload: { bookingId: string }) => void;
  now: Date;
};

function resolveDeps(deps: FeedbackDispatchDeps = {}): ResolvedDeps {
  return {
    db: deps.db ?? (prisma as unknown as FeedbackDbClient),
    sendEmail: deps.sendEmail ?? sendFeedbackRequestEmail,
    sendWhatsApp: deps.sendWhatsApp ?? sendFeedbackRequestWhatsApp,
    log: deps.log ?? logger,
    emitUpdated: deps.emitUpdated ?? emitFeedbackUpdated,
    now: deps.now ?? new Date(),
  };
}

export type SideDeliveryResult = {
  clientSide: string;
  clientName: string | null;
  token: string;
  link: string;
  emailSent: boolean;
  whatsappSent: boolean;
  skippedReasons: string[];
};

type FeedbackRecord = {
  id?: string;
  tenantId?: string;
  token: string;
  clientSide: string;
  clientName: string | null;
  isCompleted: boolean;
  notifyAttempts?: number | null;
  lastNotifyAttemptAt?: Date | null;
  lastNotifiedAt?: Date | null;
};

/**
 * Deliver the survey link for one already-persisted recipient row.
 *
 * Sending never creates a survey row — rows are created first by
 * `ensureFeedbackRecordsForBooking` — so a delivery failure can be retried without
 * ever producing a second survey or a second token.
 *
 * Success  → `lastNotifiedAt` is stamped (terminal state, never re-sent).
 * Failure  → the reason is persisted in `lastNotifyError` and the row stays
 *            retryable until FEEDBACK_MAX_NOTIFY_ATTEMPTS is reached.
 */
export async function sendFeedbackLinkForRecord(
  feedback: FeedbackRecord,
  contact: { phone?: string | null; email?: string | null },
  deps: FeedbackDispatchDeps = {},
): Promise<SideDeliveryResult> {
  const { db, sendEmail, sendWhatsApp } = resolveDeps(deps);
  const skippedReasons: string[] = [];
  let emailSent = false;
  let whatsappSent = false;
  const link = getClientFeedbackUrl(feedback.token);

  if (feedback.isCompleted) {
    return {
      clientSide: feedback.clientSide,
      clientName: feedback.clientName,
      token: feedback.token,
      link,
      emailSent: false,
      whatsappSent: false,
      skippedReasons: ['המשוב כבר מולא — לא נשלח שוב'],
    };
  }

  const email = contact.email?.trim() || null;
  const phone = primaryPhone(contact.phone);

  if (email) {
    const emailResult = await sendEmail(email, feedback.clientName, link);
    if (emailResult.ok && !emailResult.simulated) {
      emailSent = true;
    } else if (!emailResult.ok && emailResult.reason) {
      skippedReasons.push(mailFailureMessage(emailResult.reason));
    } else {
      skippedReasons.push('מייל: לא מוגדר בשרת (לא נשלח בפועל)');
    }
  } else {
    skippedReasons.push('לא הוזן אימייל ללקוח');
  }

  if (phone) {
    const waResult = await sendWhatsApp(phone, feedback.clientName, link);
    if (waResult.sent) {
      whatsappSent = true;
    } else if (waResult.hasWhatsApp === false) {
      skippedReasons.push('למספר הטלפון אין וואטסאפ');
    } else if (waResult.simulated) {
      skippedReasons.push('וואטסאפ: לא מוגדר (לא נשלח בפועל)');
    } else {
      skippedReasons.push('שליחת הוואטסאפ נכשלה');
    }
  } else {
    skippedReasons.push('לא הוזן טלפון ללקוח');
  }

  const reasons = [...new Set(skippedReasons)];

  if (emailSent || whatsappSent) {
    await db.feedback.updateMany({
      where: { token: feedback.token },
      data: {
        lastNotifiedAt: new Date(),
        lastEmailSent: emailSent,
        lastWhatsappSent: whatsappSent,
        lastNotifyError: null,
      },
    });
  } else {
    // Row stays retryable; remember why the last attempt delivered nothing.
    await db.feedback.updateMany({
      where: { token: feedback.token },
      data: { lastNotifyError: reasons.join('; ').slice(0, 500) },
    });
  }

  return {
    clientSide: feedback.clientSide,
    clientName: feedback.clientName,
    token: feedback.token,
    link,
    emailSent,
    whatsappSent,
    skippedReasons: reasons,
  };
}

export async function ensureFeedbackRecordsForBooking(
  booking: {
    id: string;
    tenantId: string;
    eventType: string;
    clientAFullName: string;
    clientAPhone: string;
    clientAEmail?: string | null;
    clientBFullName?: string | null;
    clientBPhone?: string | null;
    clientBEmail?: string | null;
  },
  deps: FeedbackDispatchDeps = {},
) {
  const { db } = resolveDeps(deps);
  const existing = await db.feedback.findMany({
    where: { bookingId: booking.id, tenantId: booking.tenantId },
  });

  const sides = buildFeedbackSides(booking);
  const missing = sides.filter((side) => !existing.some((row) => row.clientSide === side.side));

  if (missing.length === 0) return existing;

  // `skipDuplicates` + @@unique([bookingId, clientSide]) make record creation
  // idempotent even when two workers race on the same booking.
  await db.feedback.createMany({
    data: missing.map((side) => ({
      tenantId: booking.tenantId,
      bookingId: booking.id,
      clientSide: side.side,
      clientName: side.name,
      token: randomUUID(),
    })),
    skipDuplicates: true,
  });

  return db.feedback.findMany({ where: { bookingId: booking.id, tenantId: booking.tenantId } });
}

export function contactForSide(
  booking: {
    clientAPhone: string;
    clientAEmail?: string | null;
    clientBPhone?: string | null;
    clientBEmail?: string | null;
  },
  clientSide: string,
): { phone?: string | null; email?: string | null } {
  if (clientSide === 'B') {
    return { phone: booking.clientBPhone, email: booking.clientBEmail };
  }
  if (clientSide === 'A') {
    return { phone: booking.clientAPhone, email: booking.clientAEmail };
  }
  // Unknown side — never fall back to another party's contact details.
  return { phone: null, email: null };
}

/** Backwards-compatible wrapper over the schedule module. */
export function hasEventEnded(
  booking: { timeOfDay?: string | null },
  eventDate: Date,
  eventForm?: { eventTime?: string | null } | null,
  now: Date = new Date(),
): boolean {
  return hasEventEndedAt({ eventDate, booking, eventForm }, now);
}

type DispatchBooking = {
  id: string;
  tenantId: string;
  eventType: string;
  clientAFullName: string;
  clientAPhone: string;
  clientAEmail?: string | null;
  clientBFullName?: string | null;
  clientBPhone?: string | null;
  clientBEmail?: string | null;
};

/**
 * Create the missing recipient rows for a booking and deliver the pending ones.
 * Each recipient is claimed atomically in the database first, so two concurrent
 * workers — or a worker overlapping its own previous run — can never send twice.
 */
export async function dispatchFeedbackForBooking(
  booking: DispatchBooking,
  deps: FeedbackDispatchDeps = {},
): Promise<{ linksSent: number; records: number; claimed: number; failed: number }> {
  const { db, log, emitUpdated, now } = resolveDeps(deps);

  const records = await ensureFeedbackRecordsForBooking(booking, deps);
  let linksSent = 0;
  let claimedCount = 0;
  let failed = 0;

  for (const record of records) {
    if (record.isCompleted || record.lastNotifiedAt) continue;

    // Atomic claim (compare-and-set). Exactly one caller can win a row per backoff
    // window; a concurrent worker sees count === 0 and skips it.
    const claim = await db.feedback.updateMany({
      where: {
        id: record.id,
        tenantId: booking.tenantId,
        isCompleted: false,
        lastNotifiedAt: null,
        notifyAttempts: { lt: FEEDBACK_MAX_NOTIFY_ATTEMPTS },
        OR: [{ lastNotifyAttemptAt: null }, { lastNotifyAttemptAt: { lte: retryCutoff(now) } }],
      },
      data: { lastNotifyAttemptAt: now, notifyAttempts: { increment: 1 } },
    });

    if (claim.count !== 1) continue;
    claimedCount++;

    try {
      const result = await sendFeedbackLinkForRecord(
        record,
        contactForSide(booking, record.clientSide),
        deps,
      );
      if (result.emailSent || result.whatsappSent) {
        linksSent++;
        log.info('Feedback link sent', {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          feedbackId: record.id,
          clientSide: record.clientSide,
          email: result.emailSent,
          whatsapp: result.whatsappSent,
        });
      } else {
        failed++;
        log.warn('Feedback link not delivered', {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          feedbackId: record.id,
          clientSide: record.clientSide,
          reasons: result.skippedReasons,
          attempt: (record.notifyAttempts ?? 0) + 1,
        });
      }
    } catch (error) {
      // A transport-level throw must not abort the remaining recipients.
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      log.error('Feedback delivery threw', {
        tenantId: booking.tenantId,
        bookingId: booking.id,
        feedbackId: record.id,
        clientSide: record.clientSide,
        error: message,
      });
      await db.feedback
        .updateMany({
          where: { id: record.id, tenantId: booking.tenantId },
          data: { lastNotifyError: message.slice(0, 500) },
        })
        .catch(() => undefined);
    }
  }

  if (records.length > 0) {
    emitUpdated({ bookingId: booking.id });
  }
  return { linksSent, records: records.length, claimed: claimedCount, failed };
}

export type FeedbackSweepResult = {
  eventsProcessed: number;
  linksSent: number;
  checked: number;
  failedEvents: number;
  tenants: number;
};

type CandidateBooking = DispatchBooking & {
  timeOfDay?: string | null;
  eventDate: { date: Date; status: string } | null;
  eventForm?: { eventTime?: string | null } | null;
};

/**
 * Tenant-scoped query for bookings that may need a survey dispatched.
 *
 * Deliberately does NOT filter on `status === 'BOOKED'`: the nightly archive job
 * flips completed events to ARCHIVED, and that must not remove them from the
 * feedback flow. The date window bounds the scan and prevents a first run (or a
 * long outage) from mass-mailing every historical event.
 */
async function findFeedbackCandidates(
  db: FeedbackDbClient,
  tenantId: string,
  now: Date,
): Promise<CandidateBooking[]> {
  const window = feedbackScanWindow(now);
  const rows = await db.booking.findMany({
    where: {
      tenantId,
      isOption: false,
      eventDate: {
        status: { in: [...FEEDBACK_ELIGIBLE_EVENT_STATUSES] },
        date: { gte: window.gte, lte: window.lte },
      },
      OR: [
        { feedbacks: { none: {} } },
        {
          feedbacks: {
            some: {
              isCompleted: false,
              lastNotifiedAt: null,
              notifyAttempts: { lt: FEEDBACK_MAX_NOTIFY_ATTEMPTS },
            },
          },
        },
      ],
    },
    include: {
      eventDate: true,
      eventForm: { select: { eventTime: true } },
    },
  });
  return rows as CandidateBooking[];
}

async function listTenantIdsWithCandidates(db: FeedbackDbClient, now: Date): Promise<string[]> {
  const window = feedbackScanWindow(now);
  const rows = await db.booking.findMany({
    where: {
      isOption: false,
      eventDate: {
        status: { in: [...FEEDBACK_ELIGIBLE_EVENT_STATUSES] },
        date: { gte: window.gte, lte: window.lte },
      },
    },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });
  return rows.map((row) => row.tenantId as string);
}

/**
 * Process every event whose survey is due, for every tenant.
 *
 * Eligibility = `now >= feedbackDueAt(event)` — event day + 1 at FEEDBACK_SEND_HOUR,
 * computed from the real event end datetime and independent of `EventDate.status`.
 * There is therefore no race with the archive cron: the two jobs touch disjoint state.
 *
 * Failure isolation: neither a single tenant nor a single booking can abort the sweep.
 */
export async function processDueFeedback(
  now: Date = new Date(),
  deps: FeedbackDispatchDeps = {},
): Promise<FeedbackSweepResult> {
  const { db, log } = resolveDeps({ ...deps, now });

  const result: FeedbackSweepResult = {
    eventsProcessed: 0,
    linksSent: 0,
    checked: 0,
    failedEvents: 0,
    tenants: 0,
  };

  const tenantIds = await listTenantIdsWithCandidates(db, now);

  for (const tenantId of tenantIds) {
    result.tenants++;
    let candidates: CandidateBooking[] = [];
    try {
      candidates = await findFeedbackCandidates(db, tenantId, now);
    } catch (error) {
      result.failedEvents++;
      log.error('Feedback sweep failed for tenant', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue; // one tenant's failure must not stop the others
    }

    result.checked += candidates.length;

    for (const booking of candidates) {
      if (!booking.eventDate) continue;
      const timing = {
        eventDate: booking.eventDate.date,
        booking,
        eventForm: booking.eventForm,
      };
      if (!isFeedbackDue(timing, now)) continue;

      try {
        const dispatched = await dispatchFeedbackForBooking(booking, { ...deps, now });
        if (dispatched.claimed > 0) result.eventsProcessed++;
        result.linksSent += dispatched.linksSent;
      } catch (error) {
        result.failedEvents++;
        log.error('Feedback dispatch failed for booking', {
          tenantId,
          bookingId: booking.id,
          eventDate: toCalendarDateKey(booking.eventDate.date),
          endAt: eventEndDateTime(timing).toISOString(),
          dueAt: feedbackDueAt(timing).toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
        // continue with the next booking — one bad event never blocks the rest
      }
    }
  }

  log.info('Feedback sweep finished', result);
  return result;
}
