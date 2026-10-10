/**
 * Webhook envelope parsing + idempotency (§14, §15).
 *
 * Meta redelivers on any non-2xx and occasionally duplicates on success. The unique
 * index on `externalEventId` is the single source of truth for "have we seen this".
 * Processing the same delivery twice must produce no second message, conversation,
 * lead, notification or automation.
 */

import type { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { logger } from '../../utils/logger';
import { recordWhatsAppMetric } from './metrics';
import type { WebhookEventType, WhatsAppMessageType } from './types';

export type ParsedInboundMessage = {
  kind: 'message';
  externalEventId: string;
  wamid: string;
  from: string;
  timestamp: Date;
  messageType: WhatsAppMessageType;
  text: string | null;
  phoneNumberId: string | null;
  profileName: string | null;
  raw: unknown;
};

export type ParsedStatusUpdate = {
  kind: 'status';
  externalEventId: string;
  wamid: string;
  status: string;
  timestamp: Date;
  recipientId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  raw: unknown;
};

export type ParsedTemplateStatus = {
  kind: 'template_status';
  externalEventId: string;
  templateName: string;
  language: string;
  event: string;
  metaTemplateId: string | null;
  reason: string | null;
  raw: unknown;
};

export type ParsedWebhookItem = ParsedInboundMessage | ParsedStatusUpdate | ParsedTemplateStatus;

type MetaEnvelope = {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: Record<string, unknown>;
    }[];
  }[];
};

function toDate(timestamp: unknown): Date {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function textOf(msg: Record<string, unknown>): string | null {
  const type = String(msg.type ?? '');
  const node = msg[type] as Record<string, unknown> | undefined;
  if (type === 'text') return (node?.body as string) ?? null;
  if (type === 'button') return (node?.text as string) ?? null;
  if (type === 'interactive') {
    const interactive = node as Record<string, Record<string, unknown>> | undefined;
    return (
      (interactive?.button_reply?.title as string) ??
      (interactive?.list_reply?.title as string) ??
      null
    );
  }
  // Media types carry a caption rather than a body.
  if (node && typeof node === 'object' && 'caption' in node) return (node.caption as string) ?? null;
  return null;
}

/**
 * Flatten a Meta envelope into individually-idempotent items.
 *
 * `externalEventId` must be stable across redeliveries and unique per logical event.
 * For statuses the wamid alone is not enough (sent/delivered/read share it), so the
 * status value is part of the key.
 */
export function parseWebhookEnvelope(payload: unknown): ParsedWebhookItem[] {
  const body = payload as MetaEnvelope;
  const items: ParsedWebhookItem[] = [];

  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    return items;
  }

  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      const value = (change.value ?? {}) as Record<string, unknown>;
      const metadata = value.metadata as Record<string, unknown> | undefined;
      const phoneNumberId = (metadata?.phone_number_id as string) ?? null;
      const contacts = (value.contacts as Record<string, unknown>[] | undefined) ?? [];
      const profileName =
        ((contacts[0]?.profile as Record<string, unknown> | undefined)?.name as string) ?? null;

      for (const msg of (value.messages as Record<string, unknown>[] | undefined) ?? []) {
        const wamid = msg.id as string | undefined;
        const from = msg.from as string | undefined;
        if (!wamid || !from) continue;
        items.push({
          kind: 'message',
          externalEventId: `msg:${wamid}`,
          wamid,
          from,
          timestamp: toDate(msg.timestamp),
          messageType: (msg.type as WhatsAppMessageType) ?? 'unknown',
          text: textOf(msg),
          phoneNumberId,
          profileName,
          raw: msg,
        });
      }

      for (const status of (value.statuses as Record<string, unknown>[] | undefined) ?? []) {
        const wamid = status.id as string | undefined;
        const statusValue = status.status as string | undefined;
        if (!wamid || !statusValue) continue;
        const errors = (status.errors as Record<string, unknown>[] | undefined) ?? [];
        items.push({
          kind: 'status',
          externalEventId: `status:${wamid}:${statusValue}`,
          wamid,
          status: statusValue,
          timestamp: toDate(status.timestamp),
          recipientId: (status.recipient_id as string) ?? null,
          errorCode: errors[0]?.code !== undefined ? String(errors[0].code) : null,
          errorMessage:
            (errors[0]?.title as string) ??
            ((errors[0]?.error_data as Record<string, unknown> | undefined)?.details as string) ??
            null,
          raw: status,
        });
      }

      if (change.field === 'message_template_status_update') {
        const name = value.message_template_name as string | undefined;
        const language = (value.message_template_language as string) ?? 'he';
        const event = (value.event as string) ?? 'UNKNOWN';
        if (name) {
          items.push({
            kind: 'template_status',
            externalEventId: `tpl:${name}:${language}:${event}:${String(value.message_template_id ?? '')}`,
            templateName: name,
            language,
            event,
            metaTemplateId: value.message_template_id ? String(value.message_template_id) : null,
            reason: (value.reason as string) ?? null,
            raw: value,
          });
        }
      }
    }
  }

  return items;
}

export type PersistOutcome = { id: string; duplicate: boolean };

/**
 * Record a webhook item exactly once.
 * `duplicate: true` means an earlier delivery already claimed this event — the caller
 * must skip all side effects.
 */
export async function persistWebhookEvent(params: {
  item: ParsedWebhookItem;
  tenantId: string | null;
}): Promise<PersistOutcome> {
  const eventType: WebhookEventType = params.item.kind;

  try {
    const created = await prisma.whatsAppWebhookEvent.create({
      data: {
        tenantId: params.tenantId,
        externalEventId: params.item.externalEventId,
        eventType,
        payload: params.item.raw as Prisma.InputJsonValue,
        status: 'Pending',
      },
      select: { id: true },
    });
    recordWhatsAppMetric('whatsapp_webhook_received');
    return { id: created.id, duplicate: false };
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      recordWhatsAppMetric('whatsapp_webhook_duplicate');
      logger.debug('Duplicate WhatsApp webhook event ignored', {
        externalEventId: params.item.externalEventId,
      });
      const existing = await prisma.whatsAppWebhookEvent.findUnique({
        where: { externalEventId: params.item.externalEventId },
        select: { id: true },
      });
      return { id: existing?.id ?? '', duplicate: true };
    }
    throw error;
  }
}

/**
 * Claim a stored event for processing. Returns false if another worker got there
 * first, or the event is already done.
 */
export async function claimWebhookEvent(id: string, workerId: string): Promise<boolean> {
  const result = await prisma.whatsAppWebhookEvent.updateMany({
    where: { id, status: { in: ['Pending', 'Failed'] } },
    data: { status: 'Processing', claimedBy: workerId, claimedAt: new Date() },
  });
  return result.count === 1;
}

export async function markWebhookEventProcessed(id: string, ignored = false): Promise<void> {
  await prisma.whatsAppWebhookEvent.update({
    where: { id },
    data: {
      status: ignored ? 'Ignored' : 'Processed',
      processedAt: new Date(),
      claimedBy: null,
      claimedAt: null,
      error: null,
    },
  });
}

const MAX_WEBHOOK_RETRIES = Number(process.env.WHATSAPP_WEBHOOK_MAX_RETRIES ?? 5);

export async function markWebhookEventFailed(id: string, error: unknown): Promise<void> {
  const row = await prisma.whatsAppWebhookEvent.findUnique({
    where: { id },
    select: { retryCount: true },
  });
  const retryCount = (row?.retryCount ?? 0) + 1;
  // Past the retry budget the event stays Failed and is no longer re-claimed by the
  // worker's Pending/Failed query being bounded — see claimPendingWebhookEvents.
  await prisma.whatsAppWebhookEvent.update({
    where: { id },
    data: {
      status: 'Failed',
      retryCount,
      claimedBy: null,
      claimedAt: null,
      error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    },
  });
  recordWhatsAppMetric('whatsapp_webhook_failed');
  logger.error('WhatsApp webhook event processing failed', {
    webhookEventId: id,
    retryCount,
    exhausted: retryCount >= MAX_WEBHOOK_RETRIES,
  });
}

/** Events still needing work, excluding those past the retry budget (no infinite loop). */
export async function claimPendingWebhookEvents(
  workerId: string,
  limit = 50,
): Promise<{ id: string; eventType: string; payload: unknown }[]> {
  const candidates = await prisma.whatsAppWebhookEvent.findMany({
    where: {
      status: { in: ['Pending', 'Failed'] },
      retryCount: { lt: MAX_WEBHOOK_RETRIES },
    },
    orderBy: { receivedAt: 'asc' },
    take: limit,
    select: { id: true, eventType: true, payload: true },
  });

  const claimed: typeof candidates = [];
  for (const candidate of candidates) {
    if (await claimWebhookEvent(candidate.id, workerId)) claimed.push(candidate);
  }
  return claimed;
}
