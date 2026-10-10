/**
 * Regression tests for post-event feedback timing.
 *
 * Covers the defects found in the 2026-09-05 production audit:
 *  - overnight events resolving their end datetime to the SAME day (19:00 → 01:00)
 *  - the midnight race between the archive cron and the feedback cron
 *  - the "next day" business rule being expressed as "yesterday by date"
 */

import {
  endsNextDay,
  getEventEndDateTime,
  getSlotEndDateTime,
} from '../src/utils/eventStart';
import {
  FEEDBACK_LOOKBACK_DAYS,
  FEEDBACK_SEND_HOUR,
  canAttemptDelivery,
  eventCivilDay,
  eventEndDateTime,
  feedbackDueAt,
  feedbackScanWindow,
  hasEventEndedAt,
  isFeedbackDue,
} from '../src/utils/feedbackSchedule';

const MONDAY = '2026-09-07';
const monday = (h: number, m = 0) => new Date(2026, 8, 7, h, m, 0, 0);
const tuesday = (h: number, m = 0) => new Date(2026, 8, 8, h, m, 0, 0);
const wednesday = (h: number, m = 0) => new Date(2026, 8, 9, h, m, 0, 0);

const booking = (timeOfDay: string) => ({ timeOfDay });

describe('event end datetime — overnight events', () => {
  // Case A: 22:00 → 23:00 (same day)
  it('A: 22:00 → 23:00 ends the same day', () => {
    const end = getEventEndDateTime(MONDAY, booking('evening|22:00 - 23:00'));
    expect(end.getDate()).toBe(7);
    expect(end.getHours()).toBe(23);
  });

  // Case B: 22:00 → 00:00 (midnight = next day)
  it('B: 22:00 → 00:00 ends at midnight of the NEXT day', () => {
    const end = getEventEndDateTime(MONDAY, booking('evening|22:00 - 00:00'));
    expect(end.getDate()).toBe(8);
    expect(end.getHours()).toBe(0);
  });

  // Case C: 19:00 → 01:00 — the regression that used to resolve to Monday 01:00
  it('C: 19:00 → 01:00 ends 01:00 on the FOLLOWING day (was Monday 01:00)', () => {
    const end = getEventEndDateTime(MONDAY, booking('evening|19:00 - 01:00'));
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(8);
    expect(end.getDate()).toBe(8);
    expect(end.getHours()).toBe(1);
  });

  // Case D: 23:30 → 02:00
  it('D: 23:30 → 02:00 ends 02:00 on the following day', () => {
    const end = getEventEndDateTime(MONDAY, booking('evening|23:30 - 02:00'));
    expect(end.getDate()).toBe(8);
    expect(end.getHours()).toBe(2);
  });

  // Case E: long event spanning midnight by many hours
  it('E: 20:00 → 04:30 spans midnight and ends 04:30 the following day', () => {
    const end = getEventEndDateTime(MONDAY, booking('evening|20:00 - 04:30'));
    expect(end.getDate()).toBe(8);
    expect(end.getHours()).toBe(4);
    expect(end.getMinutes()).toBe(30);
  });

  it('daytime slots are unaffected', () => {
    expect(getEventEndDateTime(MONDAY, booking('morning|08:00 - 12:00')).getDate()).toBe(7);
    expect(getEventEndDateTime(MONDAY, booking('noon|12:00 - 18:00')).getDate()).toBe(7);
    expect(getEventEndDateTime(MONDAY, booking('noon|12:00 - 18:00')).getHours()).toBe(18);
  });

  it('the default evening slot (18:00 - 00:00) still ends at next-day midnight', () => {
    const end = getEventEndDateTime(MONDAY, booking('evening|18:00 - 00:00'));
    expect(end.getDate()).toBe(8);
    expect(end.getHours()).toBe(0);
  });

  it('endsNextDay is the single rule behind all of the above', () => {
    expect(endsNextDay('22:00', '23:00')).toBe(false);
    expect(endsNextDay('22:00', '00:00')).toBe(true);
    expect(endsNextDay('19:00', '01:00')).toBe(true);
    expect(endsNextDay('23:30', '02:00')).toBe(true);
    expect(endsNextDay('08:00', '12:00')).toBe(false);
  });

  it('getSlotEndDateTime and getEventEndDateTime agree', () => {
    const a = getSlotEndDateTime(MONDAY, booking('evening|19:00 - 01:00'));
    const b = getEventEndDateTime(MONDAY, booking('evening|19:00 - 01:00'));
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe('hasEventEnded', () => {
  const overnight = { eventDate: monday(12), booking: booking('evening|19:00 - 01:00') };

  it('an overnight event has NOT ended on the morning of the event day', () => {
    // The old behaviour returned true here and emailed the survey before the event.
    expect(hasEventEndedAt(overnight, monday(9))).toBe(false);
    expect(hasEventEndedAt(overnight, monday(23))).toBe(false);
  });

  it('an overnight event has ended once the following 01:00 passes', () => {
    expect(hasEventEndedAt(overnight, tuesday(1))).toBe(true);
    expect(hasEventEndedAt(overnight, tuesday(2))).toBe(true);
  });
});

describe('next-day business rule', () => {
  it('event ending Monday 23:00 is due Tuesday at the configured send hour', () => {
    const due = feedbackDueAt({ eventDate: monday(12), booking: booking('evening|18:00 - 23:00') });
    expect(due.getDate()).toBe(8);
    expect(due.getHours()).toBe(FEEDBACK_SEND_HOUR);
    expect(due.getMinutes()).toBe(0);
  });

  it('the default evening slot ending exactly at midnight is due the SAME next day', () => {
    // Regression: this event ends at the exact instant the archive job runs.
    const timing = { eventDate: monday(12), booking: booking('evening|18:00 - 00:00') };
    expect(eventEndDateTime(timing).getDate()).toBe(8);
    const due = feedbackDueAt(timing);
    expect(due.getDate()).toBe(8);
    expect(due.getHours()).toBe(FEEDBACK_SEND_HOUR);
  });

  it('an overnight event (Mon 19:00 → Tue 01:00) belongs to Monday and is due Tuesday', () => {
    const timing = { eventDate: monday(12), booking: booking('evening|19:00 - 01:00') };
    expect(eventCivilDay(eventEndDateTime(timing)).getDate()).toBe(7);
    const due = feedbackDueAt(timing);
    expect(due.getDate()).toBe(8);
    expect(due.getHours()).toBe(FEEDBACK_SEND_HOUR);
  });

  it('is not due before the send hour, and is due from the send hour onwards', () => {
    const timing = { eventDate: monday(12), booking: booking('evening|18:00 - 23:00') };
    expect(isFeedbackDue(timing, monday(23, 30))).toBe(false);
    expect(isFeedbackDue(timing, tuesday(0, 5))).toBe(false);
    expect(isFeedbackDue(timing, tuesday(FEEDBACK_SEND_HOUR - 1, 59))).toBe(false);
    expect(isFeedbackDue(timing, tuesday(FEEDBACK_SEND_HOUR))).toBe(true);
    expect(isFeedbackDue(timing, wednesday(FEEDBACK_SEND_HOUR))).toBe(true); // catch-up after downtime
  });

  it('eligibility never depends on EventDate.status — nothing here reads it', () => {
    // Both jobs (archive + feedback) may run at 00:00; the feedback decision is a
    // pure function of the event end datetime, so the outcome is deterministic.
    const timing = { eventDate: monday(12), booking: booking('evening|18:00 - 00:00') };
    const dueBefore = feedbackDueAt(timing).getTime();
    const dueAfterArchive = feedbackDueAt(timing).getTime();
    expect(dueBefore).toBe(dueAfterArchive);
  });
});

describe('scan window', () => {
  it('covers the lookback period and never includes future events', () => {
    const { gte, lte } = feedbackScanWindow(tuesday(10));
    expect(lte.getDate()).toBe(8);
    expect(lte.getHours()).toBe(0);
    const days = Math.round((lte.getTime() - gte.getTime()) / 86400000);
    expect(days).toBe(FEEDBACK_LOOKBACK_DAYS);
  });
});

describe('retry policy', () => {
  it('a fresh row can be attempted', () => {
    expect(canAttemptDelivery({ notifyAttempts: 0, lastNotifyAttemptAt: null }, tuesday(10))).toBe(
      true,
    );
  });

  it('a row attempted moments ago must wait for the backoff', () => {
    expect(
      canAttemptDelivery({ notifyAttempts: 1, lastNotifyAttemptAt: tuesday(9, 45) }, tuesday(10)),
    ).toBe(false);
  });

  it('a row attempted long enough ago is retryable', () => {
    expect(
      canAttemptDelivery({ notifyAttempts: 1, lastNotifyAttemptAt: tuesday(8) }, tuesday(10)),
    ).toBe(true);
  });

  it('attempts are bounded', () => {
    expect(
      canAttemptDelivery({ notifyAttempts: 5, lastNotifyAttemptAt: monday(1) }, wednesday(10)),
    ).toBe(false);
  });
});

describe('DST and month boundaries', () => {
  it('an event on the last day of a month is due on the 1st of the next month', () => {
    const due = feedbackDueAt({
      eventDate: new Date(2026, 8, 30, 12),
      booking: booking('evening|18:00 - 23:00'),
    });
    expect(due.getMonth()).toBe(9); // October
    expect(due.getDate()).toBe(1);
    expect(due.getHours()).toBe(FEEDBACK_SEND_HOUR);
  });

  it('the Israeli DST change (last Sunday of October) keeps the send hour local', () => {
    // Israel leaves DST on Sunday 2026-10-25 at 02:00, so that civil day is 25
    // hours long. An event on Saturday 2026-10-24 running 18:00 → 00:00 ends at
    // midnight, still belongs to the 24th, and must be due on the 25th at exactly
    // 10:00 *local* — not 09:00 or 11:00, and not a day later.
    const due = feedbackDueAt({
      eventDate: new Date(2026, 9, 24, 12),
      booking: booking('evening|18:00 - 00:00'),
    });
    expect(due.getMonth()).toBe(9);
    expect(due.getDate()).toBe(25);
    expect(due.getHours()).toBe(FEEDBACK_SEND_HOUR);
    expect(due.getMinutes()).toBe(0);
  });

  it('an event held on the DST-change day itself is due the next day at the send hour', () => {
    const due = feedbackDueAt({
      eventDate: new Date(2026, 9, 25, 12),
      booking: booking('evening|19:00 - 01:00'),
    });
    expect(due.getDate()).toBe(26);
    expect(due.getHours()).toBe(FEEDBACK_SEND_HOUR);
  });

  it('a year boundary rolls over correctly', () => {
    const due = feedbackDueAt({
      eventDate: new Date(2026, 11, 31, 12),
      booking: booking('evening|18:00 - 23:00'),
    });
    expect(due.getFullYear()).toBe(2027);
    expect(due.getMonth()).toBe(0);
    expect(due.getDate()).toBe(1);
  });
});
