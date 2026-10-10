/**
 * WhatsApp integration — shared vocabulary.
 *
 * Statuses are string unions (not Prisma enums) to match this schema's existing
 * convention, with `const` arrays so runtime validation and TS types stay in sync.
 */

// ---------------------------------------------------------------------------
// Status vocabularies
// ---------------------------------------------------------------------------

export const MESSAGE_DIRECTIONS = ['Inbound', 'Outbound'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_TYPES = [
  'text',
  'template',
  'document',
  'image',
  'audio',
  'video',
  'sticker',
  'interactive',
  'location',
  'contacts',
  'button',
  'reaction',
  'unknown',
] as const;
export type WhatsAppMessageType = (typeof MESSAGE_TYPES)[number];

/** Outbound kinds the provider abstraction can actually send. */
export const SENDABLE_TYPES = ['text', 'template', 'document', 'media', 'interactive'] as const;
export type SendableType = (typeof SENDABLE_TYPES)[number];

export const MESSAGE_STATUSES = [
  'Pending',
  'Processing',
  'Sent',
  'Delivered',
  'Read',
  'Failed',
  'Cancelled',
  /** Terminal status for inbound messages — they are never "sent". */
  'Received',
] as const;
export type WhatsAppMessageStatus = (typeof MESSAGE_STATUSES)[number];

export const OUTBOX_STATUSES = ['Pending', 'Processing', 'Sent', 'Failed', 'Cancelled'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const WEBHOOK_EVENT_STATUSES = ['Pending', 'Processing', 'Processed', 'Failed', 'Ignored'] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export const WEBHOOK_EVENT_TYPES = ['message', 'status', 'template_status', 'unknown'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const CONVERSATION_STATUSES = [
  'Unassigned',
  'Assigned',
  'WaitingForCustomer',
  'WaitingForManager',
  'Closed',
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/**
 * Meta owns template approval. `Draft` means "exists locally only" and must never
 * be treated as sendable — see docs/whatsapp/templates.md.
 */
export const TEMPLATE_META_STATUSES = ['Draft', 'Pending', 'Approved', 'Rejected', 'Disabled'] as const;
export type TemplateMetaStatus = (typeof TEMPLATE_META_STATUSES)[number];

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const AUTOMATION_TRIGGERS = [
  'ContractSigned',
  'PaymentOverdue',
  'EventApproaching',
  'IncomingMessage',
  'ProductionFormReady',
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_ACTIONS = [
  'SendWhatsAppToCustomer',
  'SendWhatsAppToManager',
  'NotifyManagerInApp',
] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

export type TemplateComponent = Record<string, unknown>;

export type SendTextRequest = {
  kind: 'text';
  to: string;
  body: string;
  previewUrl?: boolean;
};

export type SendTemplateRequest = {
  kind: 'template';
  to: string;
  templateName: string;
  languageCode: string;
  components?: TemplateComponent[];
};

export type SendDocumentRequest = {
  kind: 'document';
  to: string;
  filename: string;
  /** Exactly one of mediaId / link / base64 must be provided. */
  mediaId?: string;
  link?: string;
  base64?: string;
  mimeType?: string;
  caption?: string;
};

export type SendMediaRequest = {
  kind: 'media';
  to: string;
  mediaType: 'image' | 'audio' | 'video' | 'sticker';
  mediaId?: string;
  link?: string;
  caption?: string;
};

export type SendInteractiveRequest = {
  kind: 'interactive';
  to: string;
  /** Meta `interactive` object, passed through verbatim. */
  interactive: Record<string, unknown>;
};

export type SendRequest =
  | SendTextRequest
  | SendTemplateRequest
  | SendDocumentRequest
  | SendMediaRequest
  | SendInteractiveRequest;

export type SendSuccess = {
  ok: true;
  /** Meta `wamid.*` */
  externalMessageId: string;
  provider: string;
};

export type SendFailure = {
  ok: false;
  provider: string;
  /** See errors.ts — drives retry vs. permanent-fail. */
  code: WhatsAppErrorCode;
  message: string;
  retryable: boolean;
  /** Seconds to wait before retrying, when the provider tells us. */
  retryAfterSec?: number;
  httpStatus?: number;
  providerCode?: string | number;
};

export type SendResult = SendSuccess | SendFailure;

export type MediaUploadResult =
  | { ok: true; mediaId: string; provider: string }
  | { ok: false; provider: string; code: WhatsAppErrorCode; message: string; retryable: boolean };

/**
 * The whole application talks to WhatsApp through this interface only.
 * Implementations: MetaWhatsAppProvider (Graph API) and FakeWhatsAppProvider (dev/tests).
 */
export interface IWhatsAppProvider {
  readonly name: string;
  /** False when credentials/config are missing — callers must not enqueue live sends. */
  isConfigured(): boolean;

  sendTextAsync(req: SendTextRequest): Promise<SendResult>;
  sendTemplateAsync(req: SendTemplateRequest): Promise<SendResult>;
  sendDocumentAsync(req: SendDocumentRequest): Promise<SendResult>;
  sendMediaAsync(req: SendMediaRequest): Promise<SendResult>;
  sendInteractiveAsync(req: SendInteractiveRequest): Promise<SendResult>;

  /** Generic dispatch used by the outbox worker. */
  sendAsync(req: SendRequest): Promise<SendResult>;

  uploadMediaAsync(buffer: Buffer, filename: string, mimeType: string): Promise<MediaUploadResult>;
}

// Imported last to avoid a circular type-only reference at the top of the file.
import type { WhatsAppErrorCode } from './errors';
export type { WhatsAppErrorCode };
