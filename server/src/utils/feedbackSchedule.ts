/**
 * Post-event feedback scheduling — pure, side-effect-free decision logic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TIMEZONE POLICY (see docs/FEEDBACK-FLOW.md)
 * ─────────────────────────────────────────────────────────────────────────────
 * The venue operates in a single civil timezone. Every calendar decision in this
 * module is made in the **server's local civil time**, which MUST be the venue's
 * timezone (`TZ=Asia/Jerusalem`, set in docker-compose.prod.yml and validated at
 * boot by `assertFeedbackTimezone`). `EventDate.date` is stored as local noon
 * (`dateLocal.parseCalendarDate`) precisely so that a civil date survives any
 * UTC conversion, and all arithmetic here goes through `dateLocal` helpers, which
 * use local `Date` constructors and are therefore DST-safe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEXT-DAY BUSINESS RULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Feedback for an event becomes due on the civil day AFTER the event, at
 * `FEEDBACK_SEND_HOUR` local time.
 *
 * The "day of the event" is derived from the actual event END datetime, not from
 * the stored calendar date alone, with one refinement: an event that ends in the
 * small hours (before `NIGHT_ROLLOVER_HOUR`) belongs to the previous civil day —
 * a wedding running Monday 19:00 → Tuesday 01:00 is a *Monday* event, so its
 * survey is due Tuesday 10:00, not Wednesday 10:00.
 *
 *   Mon 23:00 end            → due Tue 10:00
 *   Mon 19:00 → Tue 00:00    → due Tue 10:00   (default evening slot)
 *   Mon 19:00 → Tue 01:00    → due Tue 10:00   (overnight)
 *   Mon 23:30 → Tue 02:00    → due Tue 10:00   (overnight)
 *   Mon 08:00 → Mon 12:00    → due Tue 10:00   (morning slot)
 *
 * Eligibility NEVER depends on `EventDate.status`. The nightly archive job may
 * flip an event to ARCHIVED before the feedback job runs; that must not, and now
 * does not, affect feedback processing. There is therefore no race between the
 * two cron jobs: they read and write disjoint state.
 */

import { addCalendarDays, localStartOfDay, toCalendarDateKey } from './dateLocal';
import { getEventEndDateTime, type BookingTime, type EventFormTime } from './eventStart';

/** Local hour at which the previous day's surveys go out. */
export const FEEDBACK_SEND_HOUR = Number(process.env.FEEDBACK_SEND_HOUR ?? 10);

/**
 * An event ending before this local hour is attributed to the previous civil day.
 * Covers weddings that run past midnight.
 */
export const NIGHT_ROLLOVER_HOUR = Number(process.env.FEEDBACK_NIGHT_ROLLOVER_HOUR ?? 5);

/**
 * How far back the worker looks for un-dispatched events. Bounds the query and,
 * critically, prevents a first deployment (or a long outage) from mass-mailing
 * every historical event that has no feedback rows.
 */
export const FEEDBACK_LOOKBACK_DAYS = Number(process.env.FEEDBACK_LOOKBACK_DAYS ?? 14);

/** Event statuses whose events still take part in the feedback flow. */
export const FEEDBACK_ELIGIBLE_EVENT_STATUSES = ['BOOKED', 'ARCHIVED'] as const;

/** Max delivery attempts per recipient before the row is parked for manual re-send. */
export const FEEDBACK_MAX_NOTIFY_ATTEMPTS = Number(process.env.FEEDBACK_MAX_NOTIFY_ATTEMPTS ?? 5);

/** Minimum wait between two delivery attempts for the same recipient (minutes). */
export const FEEDBACK_RETRY_BACKOFF_MINUTES = Number(
  process.env.FEEDBACK_RETRY_BACKOFF_MINUTES ?? 60,
);

export type EventTiming = {
  /** Event calendar date as stored on `EventDate.date`. */
  eventDate: Date;
  booking: BookingTime;
  eventForm?: EventFormTime | null;
};

/** Actual end instant of the event, honouring overnight end times. */
export function eventEndDateTime({ eventDate, booking, eventForm }: EventTiming): Date {
  return getEventEndDateTime(toCalendarDateKey(eventDate), booking, eventForm);
}

/** True once the event's end instant has passed. */
export function hasEventEndedAt(timing: EventTiming, now: Date = new Date()): boolean {
  return now.getTime() >= eventEndDateTime(timing).getTime();
}

/**
 * The civil day the event belongs to, derived from its end instant.
 * An end before NIGHT_ROLLOVER_HOUR belongs to the previous civil day.
 */
export function eventCivilDay(endAt: Date): Date {
  const day = localStartOfDay(endAt);
  if (endAt.getHours() < NIGHT_ROLLOVER_HOUR) {
    return localStartOfDay(addCalendarDays(day, -1));
  }
  return day;
}

/** Instant at which the survey for this event becomes due: event day + 1 at send hour. */
export function feedbackDueAt(timing: EventTiming): Date {
  const nextDay = localStartOfDay(addCalendarDays(eventCivilDay(eventEndDateTime(timing)), 1));
  nextDay.setHours(FEEDBACK_SEND_HOUR, 0, 0, 0);
  return nextDay;
}

/** True when the survey for this event should have gone out by `now`. */
export function isFeedbackDue(timing: EventTiming, now: Date = new Date()): boolean {
  return now.getTime() >= feedbackDueAt(timing).getTime();
}

/**
 * Inclusive `EventDate.date` window the worker scans.
 * Upper bound is today (an event later today can never be due yet); lower bound is
 * FEEDBACK_LOOKBACK_DAYS back, which bounds catch-up after an outage.
 */
export function feedbackScanWindow(now: Date = new Date()): { gte: Date; lte: Date } {
  return {
    gte: localStartOfDay(addCalendarDays(now, -FEEDBACK_LOOKBACK_DAYS)),
    lte: localStartOfDay(now),
  };
}

/** True when a recipient row may be attempted again now (bounded retries + backoff). */
export function canAttemptDelivery(
  record: { notifyAttempts?: number | null; lastNotifyAttemptAt?: Date | null },
  now: Date = new Date(),
): boolean {
  if ((record.notifyAttempts ?? 0) >= FEEDBACK_MAX_NOTIFY_ATTEMPTS) return false;
  if (!record.lastNotifyAttemptAt) return true;
  const elapsedMin = (now.getTime() - record.lastNotifyAttemptAt.getTime()) / 60000;
  return elapsedMin >= FEEDBACK_RETRY_BACKOFF_MINUTES;
}

/** Earliest instant a retry is allowed for a record, used to build the DB claim filter. */
export function retryCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - FEEDBACK_RETRY_BACKOFF_MINUTES * 60000);
}
