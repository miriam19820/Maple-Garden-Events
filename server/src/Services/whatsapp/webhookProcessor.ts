/**
 * Turns a persisted webhook event into domain effects (§14, §24).
 *
 * Runs OUTSIDE the HTTP request when WHATSAPP_ASYNC_WEBHOOK=true; otherwise it is
 * awaited by the controller. Either way it is driven from an already-persisted,
 * already-deduplicated event, so it is safe to re-run.
 */

import prisma from '../../config/prisma';
import { getWhatsAppConfig } from '../../config/whatsapp.config';
import { logger } from '../../utils/logger';
import { runTrigger } from './automation/registry';
import { findBookingForPhone, getOrCreateConversation } from './conversation.service';
import { applyStatusUpdate, recordInboundMessage } from './message.service';
import { normalizePhone } from './phone';
import { syncTemplateMetaStatus } from './template.service';
import type { TemplateMetaStatus } from './types';
import {
  claimPendingWebhookEvents,
  markWebhookEventFailed,
  markWebhookEventProcessed,
  type ParsedInboundMessage,
  type ParsedStatusUpdate,
  type ParsedTemplateStatus,
  type ParsedWebhookItem,
} from './webhookEvent.service';

const TEMPLATE_EVENT_MAP: Record<string, TemplateMetaStatus> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PENDING: 'Pending',
  PENDING_DELETION: 'Disabled',
  DISABLED: 'Disabled',
  PAUSED: 'Disabled',
  FLAGGED: 'Disabled',
};

/**
 * Which tenant does this event belong to?
 *
 * Preferred: the WhatsApp phone number id the message arrived on, mapped to a tenant
 * via SystemSettings. Falls back to the sole active tenant, which is correct for the
 * current single-venue deployment. Multi-WABA tenants MUST configure the mapping —
 * see docs/whatsapp/webhooks.md.
 */
export async function resolveTenantForWebhook(phoneNumberId: string | null): Promise<string | null> {
  const configured = process.env.WHATSAPP_TENANT_ID?.trim();
  if (configured) return configured;

  if (phoneNumberId) {
    const match = await prisma.whatsAppTemplate
      .findFirst({
        where: { metadata: { path: ['phoneNumberId'], equals: phoneNumberId } },
        select: { tenantId: true },
      })
      .catch(() => null);
    if (match) return match.tenantId;
  }

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    take: 2,
    select: { id: true },
  });

  if (tenants.length === 1) return tenants[0].id;

  if (tenants.length > 1) {
    // Ambiguous: guessing here would leak one tenant's messages into another (§20).
    logger.error(
      'Cannot resolve tenant for WhatsApp webhook: multiple active tenants and no mapping. Set WHATSAPP_TENANT_ID or map the phone number id.',
      { phoneNumberId },
    );
  }
  return null;
}

async function processInboundMessage(item: ParsedInboundMessage, tenantId: string): Promise<void> {
  const from = normalizePhone(item.from);
  if (!from) {
    logger.warn('Dropping inbound WhatsApp message with an unparseable sender', {
      wamid: item.wamid,
    });
    return;
  }

  const booking = await findBookingForPhone(from, tenantId);

  const conversation = await getOrCreateConversation({
    tenantId,
    phoneNumber: from,
    bookingId: booking?.id ?? null,
  });

  const { created } = await recordInboundMessage({
    tenantId,
    conversationId: conversation.id,
    bookingId: booking?.id ?? null,
    externalMessageId: item.wamid,
    messageType: item.messageType,
    content: item.text,
    payload: item.raw as never,
    occurredAt: item.timestamp,
  });

  // Second delivery of the same wamid: conversation already updated, nothing to do.
  if (!created) return;

  await runTrigger('IncomingMessage', {
    tenantId,
    conversationId: conversation.id,
    externalMessageId: item.wamid,
    bookingId: booking?.id ?? null,
    fromPhone: from,
    text: item.text,
    messageType: item.messageType,
    profileName: item.profileName,
    isKnownCustomer: !!booking,
  });

  logger.info('Inbound WhatsApp message processed', {
    tenantId,
    conversationId: conversation.id,
    wamid: item.wamid,
    messageType: item.messageType,
    matchedBooking: !!booking,
  });
}

async function processStatusUpdate(item: ParsedStatusUpdate): Promise<boolean> {
  const matched = await applyStatusUpdate({
    externalMessageId: item.wamid,
    providerStatus: item.status,
    occurredAt: item.timestamp,
    errorCode: item.errorCode,
    errorMessage: item.errorMessage,
  });

  if (!matched) {
    // Normal in a co-existence setup: the message was sent from the Business app.
    logger.debug('Status update for an unknown message id — ignoring', { wamid: item.wamid });
  }
  return matched;
}

async function processTemplateStatus(item: ParsedTemplateStatus, tenantId: string): Promise<void> {
  const metaStatus = TEMPLATE_EVENT_MAP[item.event.toUpperCase()];
  if (!metaStatus) {
    logger.warn('Unknown template status event from Meta', { event: item.event });
    return;
  }
  await syncTemplateMetaStatus({
    tenantId,
    name: item.templateName,
    language: item.language,
    metaStatus,
    metaTemplateId: item.metaTemplateId,
    reason: item.reason,
  });
}

/** Apply one parsed item. Returns false when it was deliberately ignored. */
export async function processWebhookItem(
  item: ParsedWebhookItem,
  tenantId: string | null,
): Promise<boolean> {
  switch (item.kind) {
    case 'status':
      // Status updates are matched by wamid alone, so they need no tenant.
      return processStatusUpdate(item);
    case 'message': {
      if (!tenantId) return false;
      await processInboundMessage(item, tenantId);
      return true;
    }
    case 'template_status': {
      if (!tenantId) return false;
      await processTemplateStatus(item, tenantId);
      return true;
    }
    default:
      return false;
  }
}

const WORKER_ID = `webhook:${process.env.HOSTNAME || 'local'}:${process.pid}`;

/**
 * Drain stored webhook events. Used by the background worker when async processing
 * is enabled, and as a self-healing retry path for events that failed inline.
 */
export async function runWhatsAppWebhookWorker(limit = 50): Promise<{
  claimed: number;
  processed: number;
  ignored: number;
  failed: number;
}> {
  const summary = { claimed: 0, processed: 0, ignored: 0, failed: 0 };
  const config = getWhatsAppConfig();
  if (!config.enabled) return summary;

  const events = await claimPendingWebhookEvents(WORKER_ID, limit);
  summary.claimed = events.length;

  for (const event of events) {
    try {
      const raw = event.payload as Record<string, unknown>;
      // Re-wrap the stored fragment into the shape processWebhookItem expects.
      const item = rehydrate(event.eventType, raw);
      if (!item) {
        await markWebhookEventProcessed(event.id, true);
        summary.ignored += 1;
        continue;
      }

      const tenantId = await resolveTenantForWebhook(
        item.kind === 'message' ? item.phoneNumberId : null,
      );
      const handled = await processWebhookItem(item, tenantId);
      await markWebhookEventProcessed(event.id, !handled);
      if (handled) summary.processed += 1;
      else summary.ignored += 1;
    } catch (error) {
      summary.failed += 1;
      await markWebhookEventFailed(event.id, error);
    }
  }

  return summary;
}

/** Rebuild a parsed item from the stored raw fragment. */
function rehydrate(eventType: string, raw: Record<string, unknown>): ParsedWebhookItem | null {
  if (eventType === 'message') {
    const wamid = raw.id as string | undefined;
    const from = raw.from as string | undefined;
    if (!wamid || !from) return null;
    const type = String(raw.type ?? 'unknown');
    const node = raw[type] as Record<string, unknown> | undefined;
    return {
      kind: 'message',
      externalEventId: `msg:${wamid}`,
      wamid,
      from,
      timestamp: new Date(Number(raw.timestamp) * 1000 || Date.now()),
      messageType: type as ParsedInboundMessage['messageType'],
      text: (node?.body as string) ?? (node?.caption as string) ?? null,
      phoneNumberId: null,
      profileName: null,
      raw,
    };
  }

  if (eventType === 'status') {
    const wamid = raw.id as string | undefined;
    const status = raw.status as string | undefined;
    if (!wamid || !status) return null;
    const errors = (raw.errors as Record<string, unknown>[] | undefined) ?? [];
    return {
      kind: 'status',
      externalEventId: `status:${wamid}:${status}`,
      wamid,
      status,
      timestamp: new Date(Number(raw.timestamp) * 1000 || Date.now()),
      recipientId: (raw.recipient_id as string) ?? null,
      errorCode: errors[0]?.code !== undefined ? String(errors[0].code) : null,
      errorMessage: (errors[0]?.title as string) ?? null,
      raw,
    };
  }

  if (eventType === 'template_status') {
    const name = raw.message_template_name as string | undefined;
    if (!name) return null;
    return {
      kind: 'template_status',
      externalEventId: `tpl:${name}`,
      templateName: name,
      language: (raw.message_template_language as string) ?? 'he',
      event: (raw.event as string) ?? 'UNKNOWN',
      metaTemplateId: raw.message_template_id ? String(raw.message_template_id) : null,
      reason: (raw.reason as string) ?? null,
      raw,
    };
  }

  return null;
}
