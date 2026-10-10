/**
 * Regression tests for the post-event feedback worker.
 *
 * Covers the audit findings:
 *  - archived events dropping out of the worker's query (C1)
 *  - the next-day job never finding anything (C2)
 *  - duplicate sends / no concurrency protection (§11)
 *  - a failed email never being retried, or creating a second survey (§12)
 *  - one bad event aborting the whole sweep (§15)
 *  - missing tenant scoping in worker queries (§5)
 *  - the wedding two-sided model (§7)
 */

jest.mock('../src/config/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../src/utils/realtime', () => ({ emitFeedbackUpdated: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  dispatchFeedbackForBooking,
  processDueFeedback,
  contactForSide,
  buildFeedbackSides,
} from '../src/utils/feedbackHelpers';
import { createFakeFeedbackDb } from './helpers/fakeFeedbackDb';

const TUESDAY_10 = new Date(2026, 8, 8, 10, 0, 0);
const silentLog = { info: () => undefined, warn: () => undefined, error: () => undefined };

const okEmail = async () => ({ ok: true as const });
const okWhatsApp = async () => ({ sent: true, simulated: false, hasWhatsApp: true });
const noWhatsApp = async () => ({ sent: false, simulated: false, hasWhatsApp: false });

const regularBooking = {
  id: 'b-regular',
  tenantId: 't-a',
  eventType: 'בר מצווה',
  clientAFullName: 'משפחת כהן',
  clientAPhone: '050-1111111',
  clientAEmail: 'cohen@example.test',
  clientBFullName: null,
  clientBPhone: null,
  clientBEmail: null,
  timeOfDay: 'evening|18:00 - 23:00',
  eventDate: { date: new Date(2026, 8, 7, 12), status: 'ARCHIVED' },
  eventForm: null,
};

const weddingBooking = {
  id: 'b-wedding',
  tenantId: 't-a',
  eventType: 'חתונה',
  clientAFullName: 'חתן כהן',
  clientAPhone: '050-2222222',
  clientAEmail: 'groom@example.test',
  clientBFullName: 'כלה לוי',
  clientBPhone: '050-3333333',
  clientBEmail: 'bride@example.test',
  timeOfDay: 'evening|19:00 - 01:00',
  eventDate: { date: new Date(2026, 8, 7, 12), status: 'ARCHIVED' },
  eventForm: null,
};

describe('worker — archived events (audit C1/C2)', () => {
  it('processes an event that the nightly archive job already marked ARCHIVED', async () => {
    const db = createFakeFeedbackDb({ bookings: [regularBooking] });
    const sent: string[] = [];

    const result = await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: async (to) => {
        sent.push(to);
        return { ok: true as const };
      },
      sendWhatsApp: noWhatsApp,
    });

    expect(result.linksSent).toBe(1);
    expect(result.eventsProcessed).toBe(1);
    expect(sent).toEqual(['cohen@example.test']);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].lastNotifiedAt).not.toBeNull();
  });

  it('never filters on EventDate.status === BOOKED', async () => {
    const db = createFakeFeedbackDb({ bookings: [regularBooking] });
    await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: okEmail,
      sendWhatsApp: noWhatsApp,
    });
    const statusFilters = db.bookingFindManyArgs
      .map((args) => args?.where?.eventDate?.status)
      .filter(Boolean);
    expect(statusFilters.length).toBeGreaterThan(0);
    for (const filter of statusFilters) {
      expect(filter).toEqual({ in: ['BOOKED', 'ARCHIVED'] });
    }
  });

  it('does not send before the survey is due', async () => {
    const db = createFakeFeedbackDb({ bookings: [regularBooking] });
    const result = await processDueFeedback(new Date(2026, 8, 8, 6, 0, 0), {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: okEmail,
      sendWhatsApp: noWhatsApp,
    });
    expect(result.linksSent).toBe(0);
    expect(db.rows).toHaveLength(0);
  });
});

describe('worker — tenant isolation (audit §5)', () => {
  it('scopes every candidate query by tenantId', async () => {
    const otherTenantBooking = { ...regularBooking, id: 'b-other', tenantId: 't-b' };
    const db = createFakeFeedbackDb({ bookings: [regularBooking, otherTenantBooking] });
    const sent: string[] = [];

    await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: async (to) => {
        sent.push(to);
        return { ok: true as const };
      },
      sendWhatsApp: noWhatsApp,
    });

    // Both tenants processed, but each through its own tenant-scoped query.
    const scoped = db.bookingFindManyArgs.filter((args) => args?.where?.tenantId);
    expect(scoped.map((args) => args.where.tenantId).sort()).toEqual(['t-a', 't-b']);
    expect(sent).toHaveLength(2);
    // Rows carry the tenant of their own booking — never another tenant's.
    expect(db.rows.every((row) => row.tenantId === (row.bookingId === 'b-other' ? 't-b' : 't-a'))).toBe(
      true,
    );
  });

  it('claims are tenant-scoped so a row can never be claimed under another tenant', async () => {
    const db = createFakeFeedbackDb({
      rows: [{ id: 'fb-1', tenantId: 't-b', bookingId: 'b-regular', clientSide: 'A' }],
      bookings: [regularBooking],
    });
    // The booking belongs to t-a; the pre-existing row belongs to t-b.
    // ensureFeedbackRecordsForBooking must not see it, and the claim must not match it.
    await dispatchFeedbackForBooking(regularBooking, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: okEmail,
      sendWhatsApp: noWhatsApp,
      now: TUESDAY_10,
    });
    const foreign = db.rows.find((row) => row.id === 'fb-1')!;
    expect(foreign.notifyAttempts).toBe(0);
    expect(foreign.lastNotifiedAt).toBeNull();
  });
});

describe('wedding — two independent recipients (audit §7)', () => {
  it('creates and notifies both sides with distinct tokens and correct contacts', async () => {
    const db = createFakeFeedbackDb({ bookings: [weddingBooking] });
    const sent: string[] = [];

    const result = await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: async (to) => {
        sent.push(to);
        return { ok: true as const };
      },
      sendWhatsApp: noWhatsApp,
    });

    expect(result.linksSent).toBe(2);
    expect(db.rows).toHaveLength(2);
    expect(db.rows.map((r) => r.clientSide).sort()).toEqual(['A', 'B']);
    expect(new Set(db.rows.map((r) => r.token)).size).toBe(2);
    expect(sent.sort()).toEqual(['bride@example.test', 'groom@example.test']);
  });

  it('maps each side to its own contact details and never to the other party', () => {
    expect(contactForSide(weddingBooking, 'A').email).toBe('groom@example.test');
    expect(contactForSide(weddingBooking, 'B').email).toBe('bride@example.test');
    // An unrecognised side must not fall back to party A's address.
    expect(contactForSide(weddingBooking, 'C').email).toBeNull();
  });

  it('only dual-side event types get a second recipient', () => {
    expect(buildFeedbackSides(weddingBooking).map((s) => s.side)).toEqual(['A', 'B']);
    expect(
      buildFeedbackSides({ ...weddingBooking, eventType: 'בר מצווה' }).map((s) => s.side),
    ).toEqual(['A']);
  });
});

describe('idempotency (audit §11)', () => {
  it('a second worker run sends nothing more', async () => {
    const db = createFakeFeedbackDb({ bookings: [weddingBooking] });
    const deps = {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: okEmail,
      sendWhatsApp: noWhatsApp,
    };

    const first = await processDueFeedback(TUESDAY_10, deps);
    const second = await processDueFeedback(new Date(2026, 8, 8, 11, 0, 0), deps);

    expect(first.linksSent).toBe(2);
    expect(second.linksSent).toBe(0);
    expect(db.rows).toHaveLength(2);
    expect(db.rows.every((row) => row.notifyAttempts === 1)).toBe(true);
  });

  it('two concurrent sweeps deliver each recipient exactly once', async () => {
    const db = createFakeFeedbackDb({ bookings: [weddingBooking] });
    let emails = 0;
    const deps = {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: async () => {
        emails++;
        return { ok: true as const };
      },
      sendWhatsApp: noWhatsApp,
    };

    await Promise.all([processDueFeedback(TUESDAY_10, deps), processDueFeedback(TUESDAY_10, deps)]);

    expect(emails).toBe(2); // one per side, not four
    expect(db.rows).toHaveLength(2);
    expect(db.rows.every((row) => row.notifyAttempts === 1)).toBe(true);
  });

  it('an already-completed survey is never notified again', async () => {
    const db = createFakeFeedbackDb({
      rows: [
        {
          id: 'fb-done',
          tenantId: 't-a',
          bookingId: 'b-regular',
          clientSide: 'A',
          isCompleted: true,
        },
      ],
      bookings: [regularBooking],
    });
    let emails = 0;
    await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: async () => {
        emails++;
        return { ok: true as const };
      },
      sendWhatsApp: noWhatsApp,
    });
    expect(emails).toBe(0);
  });
});

describe('email failure handling and retry (audit §12)', () => {
  it('records the failure, keeps the row retryable and creates no second survey', async () => {
    const db = createFakeFeedbackDb({ bookings: [regularBooking] });
    let attempt = 0;

    const failingDeps = {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: async () => {
        attempt++;
        return { ok: false as const, reason: 'unknown' as const };
      },
      sendWhatsApp: noWhatsApp,
    };

    const first = await processDueFeedback(TUESDAY_10, failingDeps);
    expect(first.linksSent).toBe(0);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].lastNotifiedAt).toBeNull();
    expect(db.rows[0].notifyAttempts).toBe(1);
    expect(db.rows[0].lastNotifyError).toBeTruthy();

    // Within the backoff window: no second attempt.
    await processDueFeedback(new Date(2026, 8, 8, 10, 30, 0), failingDeps);
    expect(attempt).toBe(1);

    // After the backoff: retried, succeeds, still exactly one survey row.
    const retry = await processDueFeedback(new Date(2026, 8, 8, 12, 0, 0), {
      ...failingDeps,
      sendEmail: okEmail,
    });
    expect(retry.linksSent).toBe(1);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].lastNotifiedAt).not.toBeNull();
    expect(db.rows[0].notifyAttempts).toBe(2);
    expect(db.rows[0].lastNotifyError).toBeNull();
  });

  it('a thrown transport error does not corrupt state or stop the other recipient', async () => {
    const db = createFakeFeedbackDb({ bookings: [weddingBooking] });
    const delivered: string[] = [];

    const result = await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: async (to) => {
        if (to === 'groom@example.test') throw new Error('SMTP connection reset');
        delivered.push(to);
        return { ok: true as const };
      },
      sendWhatsApp: noWhatsApp,
    });

    expect(delivered).toEqual(['bride@example.test']);
    expect(result.linksSent).toBe(1);
    const sideA = db.rows.find((r) => r.clientSide === 'A')!;
    expect(sideA.lastNotifiedAt).toBeNull();
    expect(sideA.lastNotifyError).toContain('SMTP connection reset');
  });

  it('an unconfigured mailer is simulated, never counted as SENT, and stays retryable', async () => {
    // P0-1 invariant: hardening the production configuration must NOT change this.
    // A simulated send is `ok` at the transport but is not a delivery — the row must
    // not reach the terminal SENT state, so a later run can still deliver it.
    const simulatedEmail = async () => ({ ok: true as const, simulated: true });
    const db = createFakeFeedbackDb({ bookings: [regularBooking] });

    const result = await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: simulatedEmail,
      sendWhatsApp: noWhatsApp,
    });

    expect(result.linksSent).toBe(0);
    const row = db.rows.find((r) => r.clientSide === 'A')!;
    expect(row.lastNotifiedAt).toBeNull(); // not SENT — retry remains possible
    expect(row.isCompleted).toBe(false);
    expect(row.notifyAttempts).toBe(1); // the attempt itself was still counted
    expect(row.lastNotifyError).toContain('לא מוגדר בשרת');
  });

  it('a survey with no deliverable contact is not counted as sent', async () => {
    const noContact = {
      ...regularBooking,
      id: 'b-nocontact',
      clientAEmail: null,
      clientAPhone: '',
    };
    const db = createFakeFeedbackDb({ bookings: [noContact] });
    const result = await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: okEmail,
      sendWhatsApp: okWhatsApp,
    });
    expect(result.linksSent).toBe(0);
    expect(db.rows).toHaveLength(0); // no recipient could be built
  });
});

describe('failure isolation (audit §15)', () => {
  it('one failing event does not prevent the others from being processed', async () => {
    const poison = { ...regularBooking, id: 'b-poison', clientAEmail: 'poison@example.test' };
    const db = createFakeFeedbackDb({ bookings: [poison, regularBooking, weddingBooking] });
    const originalCreate = db.feedback.createMany;
    db.feedback.createMany = async (args: { data: { bookingId: string }[] }) => {
      if (args.data[0]?.bookingId === 'b-poison') throw new Error('database write failed');
      return originalCreate(args);
    };

    const result = await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: okEmail,
      sendWhatsApp: noWhatsApp,
    });

    expect(result.failedEvents).toBe(1);
    expect(result.linksSent).toBe(3); // regular (1) + wedding (2)
    expect(db.rows.map((r) => r.bookingId).sort()).toEqual([
      'b-regular',
      'b-wedding',
      'b-wedding',
    ]);
  });

  it('one failing tenant does not stop the other tenants', async () => {
    const tenantB = { ...regularBooking, id: 'b-tb', tenantId: 't-b' };
    const db = createFakeFeedbackDb({ bookings: [regularBooking, tenantB] });
    const original = db.booking.findMany;
    db.booking.findMany = async (args: { where?: { tenantId?: string } }) => {
      if (args.where?.tenantId === 't-a') throw new Error('tenant query failed');
      return original(args);
    };

    const result = await processDueFeedback(TUESDAY_10, {
      db: db as never,
      log: silentLog,
      emitUpdated: () => undefined,
      sendEmail: okEmail,
      sendWhatsApp: noWhatsApp,
    });

    expect(result.failedEvents).toBe(1);
    expect(result.linksSent).toBe(1); // tenant B still processed
  });
});
