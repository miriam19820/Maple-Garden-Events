/**
 * Regression tests for feedback statistics.
 *
 * Audit finding C5: every statistics query filtered on `EventDate.status = BOOKED`,
 * so a response given after the nightly archive job disappeared from every KPI.
 * Audit finding M1: the response rate divided by "every expected recipient"
 * instead of "surveys actually sent".
 *
 * The aggregation is now a pure module, so the numbers can be checked against
 * hand-computed expectations.
 */

// `buildFeedbackSides` lives in feedbackHelpers, which imports the Prisma client;
// the statistics maths needs no database.
jest.mock('../src/config/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../src/utils/realtime', () => ({ emitFeedbackUpdated: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  aggregateFeedbackScores,
  avgNumbers,
  computeDeliveryTotals,
  groupByMonth,
  groupByYear,
  percentage,
  type StatsFeedbackRow,
} from '../src/utils/feedbackStats';
import { buildFeedbackSides } from '../src/utils/feedbackHelpers';

const notified = new Date(2026, 8, 8, 10, 0, 0);

function response(
  averageScore: number | null,
  overrides: Partial<StatsFeedbackRow> = {},
): StatsFeedbackRow {
  return {
    clientSide: 'A',
    foodRating: averageScore,
    serviceRating: averageScore,
    venueRating: averageScore,
    averageScore,
    isCompleted: true,
    lastNotifiedAt: notified,
    booking: { eventType: 'בר מצווה', eventDate: { date: new Date(2026, 8, 7, 12) } },
    ...overrides,
  };
}

describe('averages (audit §18 dataset)', () => {
  it('10 responses 5,5,4,4,3,3,2,2,1,1 average exactly 3', () => {
    const rows = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1].map((score) => response(score));
    const stats = aggregateFeedbackScores(rows);
    expect(stats.averages.combined).toBe(3);
    expect(stats.counts.completedFeedbacks).toBe(10);
  });

  it('counts satisfied and dissatisfied against the documented thresholds', () => {
    const rows = [5, 5, 4.5, 4, 3, 2, 1].map((score) => response(score));
    const stats = aggregateFeedbackScores(rows);
    expect(stats.counts.excellent).toBe(3); // >= 4.5
    expect(stats.counts.lowScore).toBe(3); // <= 3
  });

  it('ignores missing scores rather than treating them as zero', () => {
    expect(avgNumbers([5, null, 4])).toBe(4.5);
    expect(avgNumbers([])).toBeNull();
    expect(avgNumbers([5, 4, 4])).toBe(4.33);
  });

  it('breaks down by event type and by category', () => {
    const rows = [
      response(5, { booking: { eventType: 'חתונה', eventDate: { date: new Date(2026, 8, 7) } } }),
      response(3, { booking: { eventType: 'חתונה', eventDate: { date: new Date(2026, 8, 7) } } }),
      response(4, { booking: { eventType: 'בר מצווה', eventDate: { date: new Date(2026, 8, 7) } } }),
    ];
    const stats = aggregateFeedbackScores(rows);
    const wedding = stats.byEventType.find((t) => t.eventType === 'חתונה')!;
    expect(wedding.average).toBe(4);
    expect(wedding.count).toBe(2);
    expect(stats.categoryComparison.map((c) => c.category)).toEqual(['אוכל', 'שירות', 'אולם']);
  });

  it('groups by month and by year from the event date', () => {
    const rows = [
      response(5, { booking: { eventType: 'x', eventDate: { date: new Date(2026, 0, 15) } } }),
      response(3, { booking: { eventType: 'x', eventDate: { date: new Date(2026, 0, 20) } } }),
      response(4, { booking: { eventType: 'x', eventDate: { date: new Date(2025, 5, 1) } } }),
    ];
    expect(groupByMonth(rows)[0]).toEqual({ month: 1, label: 'ינואר', average: 4, count: 2 });
    expect(groupByYear(rows).map((y) => y.year)).toEqual([2025, 2026]);
  });
});

describe('wedding statistics (audit §14)', () => {
  const weddingBooking = {
    eventType: 'חתונה',
    clientAFullName: 'חתן',
    clientAPhone: '050-1',
    clientAEmail: 'a@example.test',
    clientBFullName: 'כלה',
    clientBPhone: '050-2',
    clientBEmail: 'b@example.test',
    feedbacks: [
      { clientSide: 'A', isCompleted: true, lastNotifiedAt: notified },
      { clientSide: 'B', isCompleted: true, lastNotifiedAt: notified },
    ],
  };

  it('both sides count as two independent responses and average correctly', () => {
    const rows = [
      response(5, { clientSide: 'A', booking: { eventType: 'חתונה', eventDate: { date: new Date(2026, 8, 7) } } }),
      response(3, { clientSide: 'B', booking: { eventType: 'חתונה', eventDate: { date: new Date(2026, 8, 7) } } }),
    ];
    const stats = aggregateFeedbackScores(rows);
    expect(stats.counts.completedFeedbacks).toBe(2);
    expect(stats.averages.combined).toBe(4); // (5 + 3) / 2
  });

  it('a wedding contributes two expected recipients, not one event', () => {
    const totals = computeDeliveryTotals([weddingBooking], (b) => buildFeedbackSides(b));
    expect(totals.expectedSides).toBe(2);
    expect(totals.sentSides).toBe(2);
    expect(totals.pendingFeedbacks).toBe(0);
    expect(totals.notSentEvents).toBe(0);
  });

  it('a wedding where only one side answered is half-answered, not fully', () => {
    const halfAnswered = {
      ...weddingBooking,
      feedbacks: [
        { clientSide: 'A', isCompleted: true, lastNotifiedAt: notified },
        { clientSide: 'B', isCompleted: false, lastNotifiedAt: notified },
      ],
    };
    const totals = computeDeliveryTotals([halfAnswered], (b) => buildFeedbackSides(b));
    expect(totals.sentSides).toBe(2);
    expect(totals.pendingFeedbacks).toBe(1);
    expect(percentage(1, totals.sentSides)).toBe(50);
  });
});

describe('response rate (audit §19)', () => {
  const singleSided = (opts: { notified: boolean; completed: boolean }) => ({
    eventType: 'בר מצווה',
    clientAFullName: 'לקוח',
    clientAPhone: '050-1',
    clientAEmail: 'a@example.test',
    clientBFullName: null,
    clientBPhone: null,
    clientBEmail: null,
    feedbacks: [
      {
        clientSide: 'A',
        isCompleted: opts.completed,
        lastNotifiedAt: opts.notified ? notified : null,
      },
    ],
  });

  it('10 sent, 5 answered → 50%', () => {
    const bookings = [
      ...Array.from({ length: 5 }, () => singleSided({ notified: true, completed: true })),
      ...Array.from({ length: 5 }, () => singleSided({ notified: true, completed: false })),
    ];
    const totals = computeDeliveryTotals(bookings, (b) => buildFeedbackSides(b));
    expect(totals.sentSides).toBe(10);
    expect(percentage(5, totals.sentSides)).toBe(50);
  });

  it('10 sent, 0 answered → 0%; 10 sent, 10 answered → 100%', () => {
    const sent = Array.from({ length: 10 }, () => singleSided({ notified: true, completed: false }));
    const totals = computeDeliveryTotals(sent, (b) => buildFeedbackSides(b));
    expect(percentage(0, totals.sentSides)).toBe(0);
    expect(percentage(10, totals.sentSides)).toBe(100);
  });

  it('events where nothing was sent are excluded from the denominator', () => {
    const bookings = [
      singleSided({ notified: true, completed: true }),
      singleSided({ notified: false, completed: false }), // e.g. no email on file
    ];
    const totals = computeDeliveryTotals(bookings, (b) => buildFeedbackSides(b));
    expect(totals.expectedSides).toBe(2);
    expect(totals.sentSides).toBe(1);
    expect(totals.notSentEvents).toBe(1);
    expect(percentage(1, totals.sentSides)).toBe(100); // response rate
    expect(percentage(1, totals.expectedSides)).toBe(50); // coverage rate
  });

  it('no surveys sent yields null rather than a divide-by-zero', () => {
    expect(percentage(0, 0)).toBeNull();
  });
});

describe('archive independence (audit C5)', () => {
  it('nothing in the aggregation reads EventDate.status', () => {
    // Responses carry no status at all — archiving cannot remove them from KPIs.
    const rows = [response(5), response(1)];
    const stats = aggregateFeedbackScores(rows);
    expect(stats.counts.completedFeedbacks).toBe(2);
    expect(stats.averages.combined).toBe(3);
    expect(Object.keys(rows[0].booking)).not.toContain('status');
  });
});
