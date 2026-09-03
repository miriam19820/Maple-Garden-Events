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
 * Two stages on purpose: a cheap indexed `contains` shortlist, then an exact
 * comparison of normalized numbers. The suffix alone is never treated as a match.
 * Returns null rather than inventing a customer (§22).
 */
export async function findBookingForPhone(
  normalizedPhone: string,
  tenantId?: string,
): Promise<MatchedBooking | null> {
  const suffix = phoneMatchSuffix(normalizedPhone);
  if (suffix.length < 9) return null;

  const candidates = (await prisma.booking.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      OR: [{ clientAPhone: { contains: suffix } }, { clientBPhone: { contains: suffix } }],
    },
    include: { eventDate: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
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
export function isWithinCustomerCareWindow(lastInboundAt: Date | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
}
