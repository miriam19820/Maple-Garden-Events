/**
 * Message ledger: persistence for inbound/outbound messages and delivery status (§18).
 *
 * Status updates are matched ONLY on externalMessageId (Meta's wamid) — never on
 * phone numbers or timestamps.
 */

import type { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { getWhatsAppConfig } from '../../config/whatsapp.config';
import { logger } from '../../utils/logger';
import { recordWhatsAppMetric } from './metrics';
import type { MessageDirection, WhatsAppMessageStatus, WhatsAppMessageType } from './types';

/** Meta status string -> our status. */
const PROVIDER_STATUS_MAP: Record<string, WhatsAppMessageStatus> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
};

/**
 * Delivery is monotonic: Sent -> Delivered -> Read. Meta can deliver webhooks out
 * of order, so a lower-ranked status must never overwrite a higher one.
 */
const STATUS_RANK: Record<string, number> = {
  Pending: 0,
  Processing: 1,
  Sent: 2,
  Delivered: 3,
  Read: 4,
};

export function mapProviderStatus(raw: string): WhatsAppMessageStatus | null {
  return PROVIDER_STATUS_MAP[raw?.toLowerCase()] ?? null;
}

export async function recordOutboundMessage(params: {
  tenantId: string;
  conversationId: string;
  bookingId?: string | null;
  messageType: WhatsAppMessageType;
  content?: string | null;
  templateName?: string | null;
  payload?: Prisma.InputJsonValue;
}): Promise<{ id: string }> {
  const config = getWhatsAppConfig();
  return prisma.whatsAppMessage.create({
    data: {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      bookingId: params.bookingId ?? null,
      direction: 'Outbound' satisfies MessageDirection,
      messageType: params.messageType,
      content: params.content ?? null,
      templateName: params.templateName ?? null,
      payload: config.features.storeRawPayloads ? (params.payload ?? undefined) : undefined,
      status: 'Pending',
    },
    select: { id: true },
  });
}

/**
 * Persist an inbound message. Idempotent on (tenantId, externalMessageId): a Meta
 * redelivery returns the existing row instead of creating a duplicate (§15).
 */
export async function recordInboundMessage(params: {
  tenantId: string;
  conversationId: string;
  bookingId?: string | null;
  externalMessageId: string;
  messageType: WhatsAppMessageType;
  content?: string | null;
  payload?: Prisma.InputJsonValue;
  occurredAt?: Date;
}): Promise<{ id: string; created: boolean }> {
  const config = getWhatsAppConfig();
  const existing = await prisma.whatsAppMessage.findUnique({
    where: {
      tenantId_externalMessageId: {
        tenantId: params.tenantId,
        externalMessageId: params.externalMessageId,
      },
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  try {
    const created = await prisma.whatsAppMessage.create({
      data: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        bookingId: params.bookingId ?? null,
        direction: 'Inbound' satisfies MessageDirection,
        messageType: params.messageType,
        content: params.content ?? null,
        externalMessageId: params.externalMessageId,
        payload: config.features.storeRawPayloads ? (params.payload ?? undefined) : undefined,
        status: 'Received',
      },
      select: { id: true },
    });

    const at = params.occurredAt ?? new Date();
    await prisma.whatsAppConversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: at,
        lastInboundAt: at,
        unreadCount: { increment: 1 },
        // A customer message puts the ball in the manager's court.
        status: 'WaitingForManager',
      },
    });

    recordWhatsAppMetric('whatsapp_messages_received');
    return { id: created.id, created: true };
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      const raced = await prisma.whatsAppMessage.findUnique({
        where: {
          tenantId_externalMessageId: {
            tenantId: params.tenantId,
            externalMessageId: params.externalMessageId,
          },
        },
        select: { id: true },
      });
      if (raced) return { id: raced.id, created: false };
    }
    throw error;
  }
}

/** Attach the provider's wamid once a send is accepted. */
export async function markMessageSent(params: {
  messageId: string;
  externalMessageId: string;
}): Promise<void> {
  const now = new Date();
  await prisma.whatsAppMessage.update({
    where: { id: params.messageId },
    data: { status: 'Sent', externalMessageId: params.externalMessageId, sentAt: now },
  });
  await prisma.whatsAppConversation.updateMany({
    where: { messages: { some: { id: params.messageId } } },
    data: { lastMessageAt: now },
  });
  recordWhatsAppMetric('whatsapp_messages_sent');
}

export async function markMessageFailed(params: {
  messageId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  await prisma.whatsAppMessage.update({
    where: { id: params.messageId },
    data: {
      status: 'Failed',
      failedAt: new Date(),
      errorCode: params.errorCode,
      // Truncated: provider text can be long and may echo message content.
      errorMessage: params.errorMessage.slice(0, 1000),
    },
  });
  recordWhatsAppMetric('whatsapp_messages_failed');
}

/**
 * Apply a Meta status webhook.
 * Returns false when no local message matches — an expected case for messages sent
 * from the WhatsApp Business app rather than through this API (co-existence, §34).
 */
export async function applyStatusUpdate(params: {
  externalMessageId: string;
  providerStatus: string;
  occurredAt: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<boolean> {
  const status = mapProviderStatus(params.providerStatus);
  if (!status) {
    logger.debug('Ignoring unknown WhatsApp status value', { providerStatus: params.providerStatus });
    return false;
  }

  const message = await prisma.whatsAppMessage.findFirst({
    where: { externalMessageId: params.externalMessageId },
    select: { id: true, status: true, tenantId: true },
  });

  if (!message) return false;

  if (status !== 'Failed' && (STATUS_RANK[status] ?? 0) <= (STATUS_RANK[message.status] ?? 0)) {
    // Out-of-order redelivery — keep the more advanced status.
    return true;
  }

  const data: {
    status: WhatsAppMessageStatus;
    sentAt?: Date;
    deliveredAt?: Date;
    readAt?: Date;
    failedAt?: Date;
    errorCode?: string | null;
    errorMessage?: string | null;
  } = { status };
  if (status === 'Sent') data.sentAt = params.occurredAt;
  if (status === 'Delivered') data.deliveredAt = params.occurredAt;
  if (status === 'Read') data.readAt = params.occurredAt;
  if (status === 'Failed') {
    data.failedAt = params.occurredAt;
    data.errorCode = params.errorCode ?? null;
    data.errorMessage = params.errorMessage?.slice(0, 1000) ?? null;
  }

  await prisma.whatsAppMessage.update({ where: { id: message.id }, data });

  if (status === 'Delivered') recordWhatsAppMetric('whatsapp_messages_delivered');
  if (status === 'Read') recordWhatsAppMetric('whatsapp_messages_read');
  if (status === 'Failed') recordWhatsAppMetric('whatsapp_messages_failed');

  logger.info('WhatsApp message status updated', {
    tenantId: message.tenantId,
    messageId: message.id,
    externalMessageId: params.externalMessageId,
    status,
  });
  return true;
}
