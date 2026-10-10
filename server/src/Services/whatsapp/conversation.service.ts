/**
 * Conversation + customer matching (§22, §23).
 *
 * There is no standalone Customer entity in this ERP — a Booking is the customer.
 * Matching therefore resolves a phone number to a Booking, never creating one.
 */

import prisma from '../../config/prisma';
import { logger } from '../../utils/logger';
import { normalizePhone, phoneMatchSuffix, phoneNumberNormalizer } from './phone';
import type { ConversationStatus } from './types';

export type MatchedBooking = {
  id: string;
  tenantId: string;
  eventCode: string;
  clientAFullName: string;
  clientAPhone: string | null;
  clientBPhone: string | null;
  managerComments: string | null;
  eventDate?: { date: Date | null; status: string | null } | null;
};

/**
 * Resolve an inbound phone number to a booking.
 *
 * The shortlist MUST compare digits only. Phone numbers are stored in this ERP
 * however staff typed them — "0501234567", "050-1234567", "+972-50-123-4567",
 * "050-1234567 | 052-9998888" — so a LIKE against the raw column misses real
 * customers whenever a separator lands inside the matched span. The SQL therefore
 * strips non-digits before comparing, and the result is still verified by exact
 * normalized comparison in code: a suffix is never on its own treated as a match.
 *
 * Returns null rather than inventing a customer (§22).
 */
export async function findBookingForPhone(
  normalizedPhone: string,
  tenantId?: string,
): Promise<MatchedBooking | null> {
  const suffix = phoneMatchSuffix(normalizedPhone);
  if (suffix.length < 9) return null;

  const pattern = `%${suffix}`;

  // Digits-only suffix match, bounded. Postgres-specific by design — this repo's
  // datasource is postgresql.
  const shortlist = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Booking"
    WHERE (${tenantId}::text IS NULL OR "tenantId" = ${tenantId}::text)
      AND (
        regexp_replace(COALESCE("clientAPhone", ''), '\D', '', 'g') LIKE ${pattern}
        OR regexp_replace(COALESCE("clientBPhone", ''), '\D', '', 'g') LIKE ${pattern}
      )
    ORDER BY "updatedAt" DESC
    LIMIT 50
  `;

  if (shortlist.length === 0) return null;

  const candidates = (await prisma.booking.findMany({
    where: { id: { in: shortlist.map((row) => row.id) } },
    include: { eventDate: true },
    orderBy: { updatedAt: 'desc' },
  })) as unknown as MatchedBooking[];

  for (const booking of candidates) {
    const phones = phoneNumberNormalizer.normalizeMany(booking.clientAPhone, booking.clientBPhone);
    if (phones.includes(normalizedPhone)) return booking;
  }

  return null;
}

/**
 * Get or create the single conversation for (tenant, phone).
 *
 * Concurrency: two webhook deliveries for the same number can race here, so the
 * unique index on (tenantId, phoneNumber) is the arbiter — on P2002 we re-read.
 */
export async function getOrCreateConversation(params: {
  tenantId: string;
  phoneNumber: string;
  bookingId?: string | null;
}): Promise<{ id: string; tenantId: string; bookingId: string | null; status: string }> {
  const phoneNumber = normalizePhone(params.phoneNumber);
  if (!phoneNumber) {
    throw new Error(`Cannot open a conversation for an unparseable phone number.`);
  }

  const existing = await prisma.whatsAppConversation.findUnique({
    where: { tenantId_phoneNumber: { tenantId: params.tenantId, phoneNumber } },
  });

  if (existing) {
    // Late-binding: attach the booking once we can identify one.
    if (!existing.bookingId && params.bookingId) {
      return prisma.whatsAppConversation.update({
        where: { id: existing.id },
        data: { bookingId: params.bookingId },
      });
    }
    return existing;
  }

  try {
    return await prisma.whatsAppConversation.create({
      data: {
        tenantId: params.tenantId,
        phoneNumber,
        bookingId: params.bookingId ?? null,
        status: 'Unassigned',
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      const raced = await prisma.whatsAppConversation.findUnique({
        where: { tenantId_phoneNumber: { tenantId: params.tenantId, phoneNumber } },
      });
      if (raced) return raced;
    }
    throw error;
  }
}

/** Tenant-scoped assignment. Throws if the conversation belongs to another tenant. */
export async function assignConversation(params: {
  tenantId: string;
  conversationId: string;
  assignedUserId: string | null;
}): Promise<{ count: number }> {
  const result = await prisma.whatsAppConversation.updateMany({
    // tenantId in the WHERE clause is the tenant-isolation guarantee (§20).
    where: { id: params.conversationId, tenantId: params.tenantId },
    data: {
      assignedUserId: params.assignedUserId,
      status: params.assignedUserId ? 'Assigned' : 'Unassigned',
    },
  });
  logger.info('WhatsApp conversation assignment changed', {
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    assigned: !!params.assignedUserId,
    matched: result.count,
  });
  return result;
}

export async function setConversationStatus(params: {
  tenantId: string;
  conversationId: string;
  status: ConversationStatus;
}): Promise<{ count: number }> {
  return prisma.whatsAppConversation.updateMany({
    where: { id: params.conversationId, tenantId: params.tenantId },
    data: { status: params.status },
  });
}

export async function markConversationRead(params: {
  tenantId: string;
  conversationId: string;
}): Promise<void> {
  await prisma.whatsAppConversation.updateMany({
    where: { id: params.conversationId, tenantId: params.tenantId },
    data: { unreadCount: 0 },
  });
}

/**
 * Meta only allows free-form (non-template) messages within 24h of the customer's
 * last inbound message. Callers use this to choose text vs. template (§42).
 */
export function isWithinCustomerCareWindow(
  lastInboundAt: Date | string | null | undefined,
): boolean {
  if (!lastInboundAt) return false;
  // Accepts a string too: the value can arrive from a JSON round-trip or a cache,
  // and silently returning "window closed" there would block legitimate replies.
  const at = lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt);
  const time = at.getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time < 24 * 60 * 60 * 1000;
}
