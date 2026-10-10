/**
 * Post-event feedback statistics — pure aggregation over persisted responses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COUNTING RULE (also documented in docs/FEEDBACK-FLOW.md)
 * ─────────────────────────────────────────────────────────────────────────────
 * The unit of measurement is a RESPONSE — one recipient, i.e. one `clientSide`
 * of one event — not an event. A wedding has two independent recipients, so it
 * contributes up to two surveys sent and two responses, and each side weighs the
 * same as any single-sided event's response in every average.
 *
 *   responseRate = responses received / surveys actually SENT
 *   coverageRate = responses received / every recipient a finished event *has*
 *                  (so events where nothing was ever sent drag it down — an
 *                  operational metric, not the response rate)
 *
 * There are no maintained counters anywhere: every number here is derived from
 * the `Feedback` rows on each call, so a submitted response is reflected
 * immediately and cannot drift. Nothing in this module looks at
 * `EventDate.status`, so archiving an event never removes its responses.
 */

export type StatsFeedbackRow = {
  clientSide: string;
  foodRating: number | null;
  serviceRating: number | null;
  venueRating: number | null;
  averageScore: number | null;
  isCompleted: boolean;
  lastNotifiedAt?: Date | null;
  booking: {
    eventType: string;
    eventDate?: { date: Date } | null;
  };
};

export type StatsBookingRow = {
  feedbacks: Array<{ clientSide: string; isCompleted: boolean; lastNotifiedAt?: Date | null }>;
};

export const LOW_SCORE_AT_OR_BELOW = 3;
export const EXCELLENT_AT_OR_ABOVE = 4.5;

export const MONTH_LABELS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function avgNumbers(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (valid.length === 0) return null;
  return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
}

export type FeedbackAggregate = {
  averages: {
    combined: number | null;
    food: number | null;
    service: number | null;
    venue: number | null;
  };
  counts: {
    completedFeedbacks: number;
    lowScore: number;
    excellent: number;
  };
  byEventType: { eventType: string; average: number | null; count: number }[];
  categoryComparison: { category: string; average: number | null }[];
};

/** Averages, satisfaction buckets and the event-type breakdown. */
export function aggregateFeedbackScores(rows: StatsFeedbackRow[]): FeedbackAggregate {
  const averages = {
    combined: avgNumbers(rows.map((f) => f.averageScore)),
    food: avgNumbers(rows.map((f) => f.foodRating)),
    service: avgNumbers(rows.map((f) => f.serviceRating)),
    venue: avgNumbers(rows.map((f) => f.venueRating)),
  };

  const byTypeMap = new Map<string, number[]>();
  for (const fb of rows) {
    const eventType = fb.booking.eventType;
    if (!byTypeMap.has(eventType)) byTypeMap.set(eventType, []);
    if (fb.averageScore != null) byTypeMap.get(eventType)!.push(fb.averageScore);
  }

  return {
    averages,
    counts: {
      completedFeedbacks: rows.length,
      lowScore: rows.filter((f) => f.averageScore != null && f.averageScore <= LOW_SCORE_AT_OR_BELOW)
        .length,
      excellent: rows.filter(
        (f) => f.averageScore != null && f.averageScore >= EXCELLENT_AT_OR_ABOVE,
      ).length,
    },
    byEventType: [...byTypeMap.entries()]
      .map(([eventType, scores]) => ({
        eventType,
        average: avgNumbers(scores),
        count: scores.length,
      }))
      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0)),
    categoryComparison: [
      { category: 'אוכל', average: averages.food },
      { category: 'שירות', average: averages.service },
      { category: 'אולם', average: averages.venue },
    ].filter((c) => c.average != null),
  };
}

export function groupByYear(rows: StatsFeedbackRow[]) {
  const map = new Map<number, number[]>();
  for (const fb of rows) {
    if (fb.averageScore == null || !fb.booking.eventDate) continue;
    const y = new Date(fb.booking.eventDate.date).getFullYear();
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(fb.averageScore);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, scores]) => ({ year, average: avgNumbers(scores), count: scores.length }));
}

export function groupByMonth(rows: StatsFeedbackRow[]) {
  const map = new Map<number, number[]>();
  for (const fb of rows) {
    if (fb.averageScore == null || !fb.booking.eventDate) continue;
    const m = new Date(fb.booking.eventDate.date).getMonth() + 1;
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(fb.averageScore);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, scores]) => ({
      month,
      label: MONTH_LABELS[month - 1],
      average: avgNumbers(scores),
      count: scores.length,
    }));
}

export type DeliveryTotals = {
  /** Every recipient that finished events have (both wedding sides count). */
  expectedSides: number;
  /** Recipients a survey was actually delivered to. */
  sentSides: number;
  /** Delivered but not yet answered. */
  pendingFeedbacks: number;
  /** Finished events where no recipient was ever notified. */
  notSentEvents: number;
};

/**
 * Delivery denominators for the rates. `sidesOf` returns the recipients a booking
 * *should* have (from `buildFeedbackSides`), which is what makes a wedding count
 * as two.
 */
export function computeDeliveryTotals<T extends StatsBookingRow>(
  finishedBookings: T[],
  sidesOf: (booking: T) => { side: string }[],
): DeliveryTotals {
  const totals: DeliveryTotals = {
    expectedSides: 0,
    sentSides: 0,
    pendingFeedbacks: 0,
    notSentEvents: 0,
  };

  for (const booking of finishedBookings) {
    const sides = sidesOf(booking);
    totals.expectedSides += sides.length;
    if (sides.length === 0) continue;

    if (!booking.feedbacks.some((f) => f.lastNotifiedAt)) {
      totals.notSentEvents++;
    }

    for (const side of sides) {
      const fb = booking.feedbacks.find((f) => f.clientSide === side.side);
      if (!fb) continue;
      if (fb.lastNotifiedAt) totals.sentSides++;
      if (fb.lastNotifiedAt && !fb.isCompleted) totals.pendingFeedbacks++;
    }
  }

  return totals;
}

export function percentage(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}
