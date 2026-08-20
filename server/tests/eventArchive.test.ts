jest.mock('../src/config/env', () => ({
  validateEnv: jest.fn(),
}));

jest.mock('../src/utils/realtime', () => ({
  emitDateUpdated: jest.fn(),
  emitDateUpdatedMany: jest.fn(),
  emitBookingUpdated: jest.fn(),
  emitSettingsUpdated: jest.fn(),
  emitEventFormsUpdated: jest.fn(),
}));

jest.mock('../src/config/prisma', () => jest.requireActual('./helpers/prismaMock'));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import prisma from '../src/config/prisma';
import { emitDateUpdatedMany } from '../src/utils/realtime';
import {
  archivePastEvents,
  deleteExpiredArchivedEvents,
  getArchiveCutoff,
  getRetentionDay,
  runDailyEventArchive,
} from '../src/Services/eventArchive.service';
import { EventStatus } from '../src/Services/calendar.service';
import { archiveLockedResult, isArchivedEvent } from '../src/Services/booking/helpers';

describe('event archive — date windows', () => {
  it('archive cutoff is local start of the current day', () => {
    const now = new Date(2026, 7, 19, 15, 45, 0);
    const cutoff = getArchiveCutoff(now);
    expect(cutoff.getFullYear()).toBe(2026);
    expect(cutoff.getMonth()).toBe(7);
    expect(cutoff.getDate()).toBe(19);
    expect(cutoff.getHours()).toBe(0);
    expect(cutoff.getMinutes()).toBe(0);
  });

  it('retention day is exactly 7 years before today', () => {
    const now = new Date(2026, 7, 19, 9, 0, 0);
    const retention = getRetentionDay(now);
    expect(retention.getFullYear()).toBe(2019);
    expect(retention.getMonth()).toBe(7);
    expect(retention.getDate()).toBe(19);
  });
});

describe('event archive — status helpers', () => {
  it('detects ARCHIVED event dates', () => {
    expect(isArchivedEvent({ eventDate: { status: 'ARCHIVED' } })).toBe(true);
    expect(isArchivedEvent({ eventDate: { status: 'BOOKED' } })).toBe(false);
    expect(isArchivedEvent({})).toBe(false);
  });

  it('returns a 403 lock payload', () => {
    const result = archiveLockedResult();
    expect(result.status).toBe(403);
    expect((result.body as { success: boolean }).success).toBe(false);
  });
});

describe('event archive — jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );
  });

  it('marks past BOOKED dates as ARCHIVED', async () => {
    (prisma.eventDate.findMany as jest.Mock).mockResolvedValue([{ id: 'date-1' }, { id: 'date-2' }]);
    (prisma.eventDate.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const now = new Date(2026, 7, 19, 0, 5, 0);
    const archived = await archivePastEvents(now);

    expect(archived).toBe(2);
    expect(prisma.eventDate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: EventStatus.BOOKED,
          date: { lt: getArchiveCutoff(now) },
        }),
      }),
    );
    expect(prisma.eventDate.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['date-1', 'date-2'] } },
      data: { status: EventStatus.ARCHIVED },
    });
    expect(emitDateUpdatedMany).toHaveBeenCalled();
  });

  it('does nothing when there are no past booked dates', async () => {
    (prisma.eventDate.findMany as jest.Mock).mockResolvedValue([]);
    const archived = await archivePastEvents(new Date(2026, 7, 19));
    expect(archived).toBe(0);
    expect(prisma.eventDate.updateMany).not.toHaveBeenCalled();
  });

  it('hard-deletes bookings at or before the 7-year retention day', async () => {
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([
      { id: 'b1', calendarDateId: 'd-old' },
      { id: 'b2', calendarDateId: 'd-old' },
    ]);
    (prisma.eventAddition.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.feedback.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.whatsAppInboundMessage.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.eventForm.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.booking.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.eventDate.findMany as jest.Mock).mockResolvedValue([
      { id: 'd-old', _count: { bookings: 0 } },
    ]);
    (prisma.eventDate.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await deleteExpiredArchivedEvents(new Date(2026, 7, 19, 0, 0, 0));

    expect(result.deletedBookings).toBe(2);
    expect(result.deletedDates).toBe(1);
    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['b1', 'b2'] } } });
    expect(prisma.eventDate.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d-old'] } } });
  });

  it('runs retention delete before archiving in the daily job', async () => {
    const calls: string[] = [];
    (prisma.booking.findMany as jest.Mock).mockImplementation(async () => {
      calls.push('delete-scan');
      return [];
    });
    (prisma.eventDate.findMany as jest.Mock).mockImplementation(async () => {
      calls.push('archive-scan');
      return [];
    });

    await runDailyEventArchive(new Date(2026, 7, 19));
    expect(calls[0]).toBe('delete-scan');
    expect(calls).toContain('archive-scan');
  });
});
