/**
 * Integration test: EventDate multi-tenancy, through the REAL Prisma client.
 *
 * Requires a real PostgreSQL (DATABASE_URL) — there is no Prisma mock here.
 * Run: npm run test:integration
 *
 * Before the 2026-09-05 fix, `EventDate.date` was UNIQUE globally, so two tenants
 * could never hold the same calendar day and an untenanted lookup could return
 * another tenant's row. See docs/EVENTDATE-TENANCY.md.
 *
 * All fixtures are created in `beforeAll` and every test is independent, so one
 * failure reports its own cause instead of cascading into the rest of the file.
 * `beforeAll` also verifies that the migration is actually applied and fails with
 * an actionable message if it is not — that is by far the most likely reason for
 * this suite to go red.
 */

jest.mock('../../src/config/env', () => ({
  validateEnv: jest.fn(),
}));

jest.mock('../../src/utils/realtime', () => ({
  emitDateUpdated: jest.fn(),
  emitDateUpdatedMany: jest.fn(),
  emitBookingUpdated: jest.fn(),
  emitSettingsUpdated: jest.fn(),
  emitFeedbackUpdated: jest.fn(),
  emitEventFormsUpdated: jest.fn(),
}));

import prisma from '../../src/config/prisma';
import { calendarService } from '../../src/Services/calendar.service';
import { archivePastEvents } from '../../src/Services/eventArchive.service';
import { calendarDateForStorage } from '../../src/utils/dateLocal';

const describeIntegration =
  process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

/**
 * A day far in the future so it can never collide with real data, and in a
 * different year from `uniqueTestCalendarKey()` (which walks 2031 Tuesdays) so the
 * two integration suites can never fight over the same calendar row.
 */
const SHARED_DAY = '2032-06-15';
const SHARED_DATE = calendarDateForStorage(SHARED_DAY);
const PREFIX = 'itest-tenancy';

const tenantA = { id: `${PREFIX}-a`, name: 'Integration Tenant A', subdomain: `${PREFIX}-a` };
const tenantB = { id: `${PREFIX}-b`, name: 'Integration Tenant B', subdomain: `${PREFIX}-b` };

const ids: { dateA?: string; dateB?: string; bookingA?: string; bookingB?: string } = {};

async function cleanup() {
  const tenantIds = [tenantA.id, tenantB.id];
  await prisma.feedback.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.eventDate.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

/**
 * Fails loudly if migration `20260905203000_eventdate_tenant_unique` has not been
 * applied to the database this suite is pointed at. Without it, EventDate.date is
 * still globally unique and the very first insert below dies with P2002.
 */
async function assertMigrationApplied() {
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'EventDate'
  `;
  const names = indexes.map((row) => row.indexname);
  const hasTenantScoped = names.includes('EventDate_tenantId_date_key');
  const hasGlobalUnique = names.includes('EventDate_date_key');

  if (!hasTenantScoped || hasGlobalUnique) {
    throw new Error(
      [
        'EventDate tenancy migration is NOT applied to this database.',
        `  indexes found: ${names.join(', ') || '(none)'}`,
        `  expected:      EventDate_tenantId_date_key present`,
        `  expected:      EventDate_date_key (global unique) absent`,
        '',
        'Apply it first:',
        '  npm run db:migrate:deploy      # or: npx prisma migrate dev',
        '',
        'See docs/EVENTDATE-TENANCY.md.',
      ].join('\n'),
    );
  }
}

const bookingDefaults = {
  clientAIdNumber: '000000000',
  clientAPhone: '050-0000000',
  eventType: 'חתונה',
  timeOfDay: 'evening|19:00 - 00:00',
  guestCount: 100,
  finalPricePortion: 0,
  totalPrice: 0,
  createdBy: 'integration-test',
  isOption: false,
};

describeIntegration('EventDate — tenant isolation (real Prisma)', () => {
  beforeAll(async () => {
    await assertMigrationApplied();
    await cleanup();

    await prisma.tenant.createMany({ data: [tenantA, tenantB], skipDuplicates: true });

    // The core requirement: the same civil day for two different tenants.
    const dateA = await prisma.eventDate.create({
      data: { tenantId: tenantA.id, date: SHARED_DATE, status: 'BOOKED' },
    });
    const dateB = await prisma.eventDate.create({
      data: { tenantId: tenantB.id, date: SHARED_DATE, status: 'BOOKED' },
    });
    ids.dateA = dateA.id;
    ids.dateB = dateB.id;

    const bookingA = await prisma.booking.create({
      data: {
        ...bookingDefaults,
        tenantId: tenantA.id,
        calendarDateId: dateA.id,
        clientAFullName: 'לקוח של A',
        eventCode: `${PREFIX}-A`,
      },
    });
    const bookingB = await prisma.booking.create({
      data: {
        ...bookingDefaults,
        tenantId: tenantB.id,
        calendarDateId: dateB.id,
        clientAFullName: 'לקוח של B',
        eventCode: `${PREFIX}-B`,
      },
    });
    ids.bookingA = bookingA.id;
    ids.bookingB = bookingB.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('both tenants hold the SAME calendar date, as two distinct rows', async () => {
    const both = await prisma.eventDate.findMany({
      where: { date: SHARED_DATE, tenantId: { in: [tenantA.id, tenantB.id] } },
      orderBy: { tenantId: 'asc' },
    });

    expect(both).toHaveLength(2);
    expect(both.map((d) => d.tenantId)).toEqual([tenantA.id, tenantB.id]);
    expect(both[0].id).not.toBe(both[1].id);
  });

  it('a single tenant still cannot hold the same date twice', async () => {
    await expect(
      prisma.eventDate.create({
        data: { tenantId: tenantA.id, date: SHARED_DATE, status: 'OPTION' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('a tenant-scoped date lookup returns only that tenant’s row', async () => {
    const forA = await prisma.eventDate.findFirst({
      where: { tenantId: tenantA.id, date: SHARED_DATE },
    });
    const forB = await prisma.eventDate.findFirst({
      where: { tenantId: tenantB.id, date: SHARED_DATE },
    });

    expect(forA?.id).toBe(ids.dateA);
    expect(forB?.id).toBe(ids.dateB);
  });

  it('the calendar service returns each tenant’s own bookings for the shared day', async () => {
    const start = new Date(2032, 5, 1, 0, 0, 0);
    const end = new Date(2032, 5, 30, 23, 59, 59);

    const forA = await calendarService.getAllCalendarDates(start, end, 'חתונה', tenantA.id);
    const forB = await calendarService.getAllCalendarDates(start, end, 'חתונה', tenantB.id);

    // NB: getAllCalendarDates synthesises an entry for every day in the range, so
    // asserting that the day is "present" proves nothing. Assert on the payload.
    const serialisedA = JSON.stringify(forA);
    const serialisedB = JSON.stringify(forB);

    expect(serialisedA).toContain(`${PREFIX}-A`);
    expect(serialisedA).not.toContain(`${PREFIX}-B`);
    expect(serialisedA).not.toContain('לקוח של B');

    expect(serialisedB).toContain(`${PREFIX}-B`);
    expect(serialisedB).not.toContain(`${PREFIX}-A`);
    expect(serialisedB).not.toContain('לקוח של A');
  });

  it('each tenant’s booking is attached to its own EventDate row', async () => {
    const aWithDate = await prisma.booking.findUniqueOrThrow({
      where: { id: ids.bookingA! },
      include: { eventDate: true },
    });
    const bWithDate = await prisma.booking.findUniqueOrThrow({
      where: { id: ids.bookingB! },
      include: { eventDate: true },
    });

    expect(aWithDate.eventDate.tenantId).toBe(tenantA.id);
    expect(bWithDate.eventDate.tenantId).toBe(tenantB.id);
    expect(aWithDate.calendarDateId).not.toBe(bWithDate.calendarDateId);
  });

  it('neither tenant reaches the other’s bookings through the EventDate relation', async () => {
    const aDate = await prisma.eventDate.findUniqueOrThrow({
      where: { id: ids.dateA! },
      include: { bookings: true },
    });
    const bDate = await prisma.eventDate.findUniqueOrThrow({
      where: { id: ids.dateB! },
      include: { bookings: true },
    });

    expect(aDate.bookings.every((booking) => booking.tenantId === tenantA.id)).toBe(true);
    expect(bDate.bookings.every((booking) => booking.tenantId === tenantB.id)).toBe(true);
    expect(aDate.bookings.map((booking) => booking.eventCode)).toEqual([`${PREFIX}-A`]);
    expect(bDate.bookings.map((booking) => booking.eventCode)).toEqual([`${PREFIX}-B`]);
  });

  it('a tenant cannot book onto another tenant’s EventDate', async () => {
    // Regression: bookEventFinal took a tenantId but never applied it, so a
    // manager of tenant A could POST tenant B's dateId and attach a booking to
    // B's calendar row. The row lock alone does not check ownership.
    await expect(
      calendarService.bookEventFinal(ids.dateB!, {}, tenantA.id),
    ).rejects.toThrow('תאריך האירוע לא נמצא.');

    const bDate = await prisma.eventDate.findUniqueOrThrow({
      where: { id: ids.dateB! },
      include: { bookings: true },
    });
    expect(bDate.bookings.every((booking) => booking.tenantId === tenantB.id)).toBe(true);
    expect(bDate.bookings).toHaveLength(1);
  });

  it('a tenant cannot create an option on another tenant’s EventDate', async () => {
    await expect(
      calendarService.createOption(ids.dateB!, {}, tenantA.id),
    ).rejects.toThrow('תאריך האירוע לא נמצא.');

    const bDate = await prisma.eventDate.findUniqueOrThrow({
      where: { id: ids.dateB! },
      include: { bookings: true },
    });
    expect(bDate.bookings).toHaveLength(1);
  });

  it('a tenant-scoped archive run leaves the other tenant untouched', async () => {
    // "Today" is well after the shared day, so both rows would be archivable.
    const now = new Date(2032, 5, 25, 3, 0, 0);

    const archived = await archivePastEvents(now, tenantA.id);
    expect(archived).toBeGreaterThanOrEqual(1);

    const a = await prisma.eventDate.findUniqueOrThrow({ where: { id: ids.dateA! } });
    const b = await prisma.eventDate.findUniqueOrThrow({ where: { id: ids.dateB! } });

    expect(a.status).toBe('ARCHIVED');
    expect(b.status).toBe('BOOKED');
  });

  it('the nightly (un-scoped) archive run still covers every tenant', async () => {
    const now = new Date(2032, 5, 25, 3, 0, 0);

    await archivePastEvents(now);

    const b = await prisma.eventDate.findUniqueOrThrow({ where: { id: ids.dateB! } });
    expect(b.status).toBe('ARCHIVED');
  });
});
