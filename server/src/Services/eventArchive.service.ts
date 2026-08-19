import prisma from '../config/prisma';
import { logger } from '../utils/logger';
import { localEndOfDay, localStartOfDay } from '../utils/dateLocal';
import { emitDateUpdatedMany } from '../utils/realtime';
import { EventStatus } from './calendar.service';
import { paginationMeta, parsePagination } from '../utils/pagination';

export const EVENT_RETENTION_YEARS = 7;

export type ArchiveJobResult = {
  archivedDates: number;
  deletedBookings: number;
  deletedDates: number;
};

export function getArchiveCutoff(now: Date = new Date()): Date {
  return localStartOfDay(now);
}

/** Civil day that is exactly `EVENT_RETENTION_YEARS` before `now`. */
export function getRetentionDay(now: Date = new Date()): Date {
  const today = localStartOfDay(now);
  const retention = new Date(today);
  retention.setFullYear(retention.getFullYear() - EVENT_RETENTION_YEARS);
  return retention;
}

export function getRetentionCutoffEnd(now: Date = new Date()): Date {
  return localEndOfDay(getRetentionDay(now));
}

const ARCHIVE_BOOKING_INCLUDE = {
  eventDate: true,
  eventForm: { select: { id: true } },
} as const;

async function hardDeleteBookingsByIds(bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.eventAddition.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await tx.feedback.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await tx.whatsAppInboundMessage.updateMany({
      where: { bookingId: { in: bookingIds } },
      data: { bookingId: null },
    });
    await tx.eventForm.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
  });
}

/**
 * Hard-delete events whose date is 7 years ago or older (retention policy).
 * Uses `<=` so a missed midnight run still purges leftover rows.
 */
export async function deleteExpiredArchivedEvents(now: Date = new Date()): Promise<{
  deletedBookings: number;
  deletedDates: number;
}> {
  const cutoffEnd = getRetentionCutoffEnd(now);

  const oldBookings = await prisma.booking.findMany({
    where: { eventDate: { date: { lte: cutoffEnd } } },
    select: { id: true, calendarDateId: true },
  });

  const bookingIds = oldBookings.map((b) => b.id);
  const dateIds = [...new Set(oldBookings.map((b) => b.calendarDateId))];

  await hardDeleteBookingsByIds(bookingIds);

  let deletedDates = 0;
  if (dateIds.length > 0) {
    const leftover = await prisma.eventDate.findMany({
      where: { id: { in: dateIds } },
      select: { id: true, _count: { select: { bookings: true } } },
    });
    const emptyIds = leftover.filter((d) => d._count.bookings === 0).map((d) => d.id);
    if (emptyIds.length > 0) {
      const result = await prisma.eventDate.deleteMany({ where: { id: { in: emptyIds } } });
      deletedDates = result.count;
    }
  }

  return { deletedBookings: bookingIds.length, deletedDates };
}

/**
 * Mark confirmed events whose date is yesterday or earlier as ARCHIVED.
 */
export async function archivePastEvents(now: Date = new Date()): Promise<number> {
  const cutoff = getArchiveCutoff(now);

  const dates = await prisma.eventDate.findMany({
    where: {
      status: EventStatus.BOOKED,
      date: { lt: cutoff },
      bookings: { some: { isOption: false } },
    },
    select: { id: true },
  });

  if (dates.length === 0) return 0;

  const ids = dates.map((d) => d.id);
  await prisma.eventDate.updateMany({
    where: { id: { in: ids } },
    data: { status: EventStatus.ARCHIVED },
  });

  emitDateUpdatedMany(ids.map((dateId) => ({ dateId, status: EventStatus.ARCHIVED })));
  return ids.length;
}

export async function runDailyEventArchive(now: Date = new Date()): Promise<ArchiveJobResult> {
  const deleted = await deleteExpiredArchivedEvents(now);
  const archivedDates = await archivePastEvents(now);
  logger.info(
    `Event archive job: archived ${archivedDates} dates, deleted ${deleted.deletedBookings} bookings / ${deleted.deletedDates} dates`,
  );
  return { archivedDates, ...deleted };
}

export type ArchiveMonthGroup = {
  year: number;
  months: { month: number; count: number }[];
};

export async function getArchiveSummary(tenantId: string): Promise<ArchiveMonthGroup[]> {
  const rows = await prisma.booking.findMany({
    where: {
      tenantId,
      isOption: false,
      eventDate: { status: EventStatus.ARCHIVED },
    },
    select: { eventDate: { select: { date: true } } },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = row.eventDate?.date;
    if (!date) continue;
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const byYear = new Map<number, { month: number; count: number }[]>();
  for (const [key, count] of counts) {
    const [yearStr, monthStr] = key.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const months = byYear.get(year) ?? [];
    months.push({ month, count });
    byYear.set(year, months);
  }

  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: months.sort((a, b) => b.month - a.month),
    }));
}

export async function getArchivedEventsForMonth(
  tenantId: string,
  year: number,
  month: number,
  query: Record<string, unknown>,
) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const { page, limit, skip } = parsePagination(query);
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';

  const where = {
    tenantId,
    isOption: false as const,
    eventDate: {
      status: EventStatus.ARCHIVED,
      date: { gte: start, lte: end },
    },
    ...(search
      ? {
          OR: [
            { clientAFullName: { contains: search, mode: 'insensitive' as const } },
            { clientAIdNumber: { contains: search } },
            { clientBFullName: { contains: search, mode: 'insensitive' as const } },
            { clientBIdNumber: { contains: search } },
            { eventCode: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy: { eventDate: { date: 'desc' } },
      include: ARCHIVE_BOOKING_INCLUDE,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    data: bookings,
    pagination: paginationMeta(page, limit, total),
  };
}
