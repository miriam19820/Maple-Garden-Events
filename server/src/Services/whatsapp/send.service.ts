/**
 * Application-level send actions (§41).
 *
 * This is the seam the API, the automation engine and any future "Send via WhatsApp"
 * button all go through. It validates, resolves the conversation, writes the message
 * ledger row and enqueues the outbox entry — it never touches the provider.
 */

import type { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { getWhatsAppConfig } from '../../config/whatsapp.config';
import { logger } from '../../utils/logger';
import { getOrCreateConversation, isWithinCustomerCareWindow } from './conversation.service';
import { WhatsAppError } from './errors';
import { recordOutboundMessage } from './message.service';
import { enqueueOutboxMessage } from './outbox.service';
import { normalizePhone } from './phone';
import { assertTemplateSendable } from './template.service';
import type { SendRequest, WhatsAppMessageType } from './types';

export type SendOutcome = {
  outboxId: string;
  messageId: string | null;
  conversationId: string;
  deduplicated: boolean;
};

export type SendCommand = {
  tenantId: string;
  /** Raw phone from anywhere in the ERP — normalised here, once. */
  toPhone: string;
  bookingId?: string | null;
  dedupeKey?: string | null;
  notBefore?: Date;
  /** For audit: which user or automation asked for this. */
  requestedBy?: string;
} & (
  | { kind: 'text'; body: string; previewUrl?: boolean }
  | { kind: 'template'; templateName: string; languageCode?: string; components?: Record<string, unknown>[] }
  | {
      kind: 'document';
      filename: string;
      mediaId?: string;
      link?: string;
      base64?: string;
      mimeType?: string;
      caption?: string;
    }
  | {
      kind: 'media';
      mediaType: 'image' | 'audio' | 'video' | 'sticker';
      mediaId?: string;
      link?: string;
      caption?: string;
    }
  | { kind: 'interactive'; interactive: Record<string, unknown> }
);

function toSendRequest(command: SendCommand, to: string, defaultLanguage: string): SendRequest {
  switch (command.kind) {
    case 'text':
      return { kind: 'text', to, body: command.body, previewUrl: command.previewUrl };
    case 'template':
      return {
        kind: 'template',
        to,
        templateName: command.templateName,
        languageCode: command.languageCode ?? defaultLanguage,
        components: command.components,
      };
    case 'document':
      return {
        kind: 'document',
        to,
        filename: command.filename,
        mediaId: command.mediaId,
        link: command.link,
        base64: command.base64,
        mimeType: command.mimeType,
        caption: command.caption,
      };
    case 'media':
      return {
        kind: 'media',
        to,
        mediaType: command.mediaType,
        mediaId: command.mediaId,
        link: command.link,
        caption: command.caption,
      };
    case 'interactive':
      return { kind: 'interactive', to, interactive: command.interactive };
  }
}

/** Human-readable summary stored on the message row. Never the raw media bytes. */
function ledgerContent(command: SendCommand): string | null {
  switch (command.kind) {
    case 'text':
      return command.body;
    case 'template':
      return null;
    case 'document':
      return command.caption ?? command.filename;
    case 'media':
      return command.caption ?? null;
    case 'interactive':
      return null;
  }
}

function ledgerType(command: SendCommand): WhatsAppMessageType {
  return command.kind === 'media' ? command.mediaType : command.kind;
}

/**
 * Queue an outgoing message.
 *
 * Throws WhatsAppError for business failures (bad number, unapproved template,
 * integration off) so callers get the project's standard error shape.
 */
export async function queueWhatsAppMessage(command: SendCommand): Promise<SendOutcome> {
  const config = getWhatsAppConfig();

  if (!config.enabled) {
    throw new WhatsAppError('WhatsAppNotConfigured', 'WhatsApp integration is disabled.', {
      tenantId: command.tenantId,
    });
  }

  const to = normalizePhone(command.toPhone);
  if (!to) {
    throw new WhatsAppError('InvalidPhoneNumber', 'The phone number is not a valid WhatsApp number.', {
      tenantId: command.tenantId,
    });
  }

  if (command.kind === 'template') {
    // Meta owns approval — a local row is not permission to send (§33).
    await assertTemplateSendable({
      tenantId: command.tenantId,
      name: command.templateName,
      language: command.languageCode ?? config.defaultLanguage,
    });
  }

  const conversation = await getOrCreateConversation({
    tenantId: command.tenantId,
    phoneNumber: to,
    bookingId: command.bookingId ?? null,
  });

  if (command.kind === 'text') {
    const full = await prisma.whatsAppConversation.findUnique({
      where: { id: conversation.id },
      select: { lastInboundAt: true },
    });
    if (!isWithinCustomerCareWindow(full?.lastInboundAt)) {
      // Meta rejects free-form messages outside the 24h window; fail before queueing
      // rather than burning retry attempts on a guaranteed rejection.
      throw new WhatsAppError(
        'MessageNotAllowed',
        'Free-form messages are only allowed within 24 hours of the customer’s last message. Use an approved template.',
        { tenantId: command.tenantId, conversationId: conversation.id },
      );
    }
  }

  const request = toSendRequest(command, to, config.defaultLanguage);

  // Ledger row + outbox row commit together — that is the outbox guarantee (§16).
  const result = await prisma.$transaction(async (tx) => {
    const client = tx as unknown as typeof prisma;

    // Check the dedupe key first so a repeat request does not leave an orphan
    // ledger row pointing at nothing.
    if (command.dedupeKey) {
      const existing = await client.whatsAppOutboxMessage.findUnique({
        where: { tenantId_dedupeKey: { tenantId: command.tenantId, dedupeKey: command.dedupeKey } },
        select: { id: true, messageId: true },
      });
      if (existing) {
        return { messageId: existing.messageId, id: existing.id, deduplicated: true };
      }
    }

    const message = await client.whatsAppMessage.create({
      data: {
        tenantId: command.tenantId,
        conversationId: conversation.id,
        bookingId: command.bookingId ?? null,
        direction: 'Outbound',
        messageType: ledgerType(command),
        content: ledgerContent(command),
        templateName: command.kind === 'template' ? command.templateName : null,
        payload: config.features.storeRawPayloads
          ? (request as unknown as Prisma.InputJsonValue)
          : undefined,
        status: 'Pending',
      },
      select: { id: true },
    });

    const enqueued = await enqueueOutboxMessage(
      {
        tenantId: command.tenantId,
        toPhone: to,
        request,
        conversationId: conversation.id,
        messageId: message.id,
        bookingId: command.bookingId ?? null,
        dedupeKey: command.dedupeKey ?? null,
        notBefore: command.notBefore,
      },
      tx,
    );

    return { ...enqueued, messageId: message.id as string | null };
  });

  logger.info('WhatsApp message queued', {
    tenantId: command.tenantId,
    conversationId: conversation.id,
    outboxId: result.id,
    kind: command.kind,
    requestedBy: command.requestedBy,
    deduplicated: result.deduplicated,
  });

  return {
    outboxId: result.id,
    messageId: result.messageId,
    conversationId: conversation.id,
    deduplicated: result.deduplicated,
  };
}

/** `recordOutboundMessage` is re-exported for callers that manage their own tx. */
export { recordOutboundMessage };
