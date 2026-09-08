/**
 * WhatsApp error vocabulary and retry classification.
 *
 * Retryable  = transient; the outbox worker backs off and tries again.
 * Permanent  = the same request will always fail; fail fast, never loop.
 */

import { AppError } from '../../utils/AppError';

export const WHATSAPP_ERROR_CODES = [
  'WhatsAppNotConfigured',
  'InvalidPhoneNumber',
  'TemplateNotApproved',
  'TemplateNotFound',
  'MessageNotAllowed',
  'ProviderUnavailable',
  'RateLimited',
  'MessageAlreadySent',
  'ConversationNotFound',
  'WebhookValidationFailed',
  'InvalidRequest',
  'AuthenticationFailed',
  'NetworkError',
  'MediaUploadFailed',
  'UnknownError',
] as const;

export type WhatsAppErrorCode = (typeof WHATSAPP_ERROR_CODES)[number];

/** Codes the worker may retry with backoff. Everything else is terminal. */
const RETRYABLE: ReadonlySet<WhatsAppErrorCode> = new Set<WhatsAppErrorCode>([
  'ProviderUnavailable',
  'RateLimited',
  'NetworkError',
]);

export function isRetryableCode(code: WhatsAppErrorCode): boolean {
  return RETRYABLE.has(code);
}

const HTTP_STATUS: Record<WhatsAppErrorCode, number> = {
  WhatsAppNotConfigured: 503,
  InvalidPhoneNumber: 400,
  TemplateNotApproved: 409,
  TemplateNotFound: 404,
  MessageNotAllowed: 409,
  ProviderUnavailable: 502,
  RateLimited: 429,
  MessageAlreadySent: 409,
  ConversationNotFound: 404,
  WebhookValidationFailed: 401,
  InvalidRequest: 400,
  AuthenticationFailed: 502,
  NetworkError: 502,
  MediaUploadFailed: 502,
  UnknownError: 500,
};

/**
 * Operational WhatsApp failure surfaced to API callers.
 * Provider internals stay in `context` (server logs) and never in `message`.
 */
export class WhatsAppError extends AppError {
  readonly whatsappCode: WhatsAppErrorCode;
  readonly retryable: boolean;

  constructor(code: WhatsAppErrorCode, message: string, context?: Record<string, unknown>) {
    super(message, {
      statusCode: HTTP_STATUS[code] ?? 500,
      code,
      // 5xx provider problems are still "expected" operationally — they must not page
      // on-call from a single failed send; the worker's retry budget handles them.
      isOperational: true,
      context,
    });
    this.name = 'WhatsAppError';
    this.whatsappCode = code;
    this.retryable = isRetryableCode(code);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Map a Meta Graph API failure onto our vocabulary.
 * Reference: Meta Cloud API error codes (developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes).
 */
export function classifyMetaError(
  httpStatus: number,
  metaCode?: number | string,
  metaSubcode?: number | string,
): { code: WhatsAppErrorCode; retryable: boolean } {
  const code = Number(metaCode);
  const subcode = Number(metaSubcode);

  // Authentication / permission — retrying with the same token cannot help.
  if (code === 190 || code === 200 || code === 3 || code === 10 || httpStatus === 401 || httpStatus === 403) {
    return { code: 'AuthenticationFailed', retryable: false };
  }

  // Throttling — Meta asks us to slow down.
  if (code === 4 || code === 80007 || code === 130429 || code === 131048 || code === 131056 || httpStatus === 429) {
    return { code: 'RateLimited', retryable: true };
  }

  // Temporary platform problems.
  if (code === 1 || code === 2 || code === 131000 || code === 131016 || httpStatus >= 500) {
    return { code: 'ProviderUnavailable', retryable: true };
  }

  // Recipient cannot receive / not a WhatsApp user / invalid number.
  if (code === 131026 || code === 131051 || code === 133010 || subcode === 2494008) {
    return { code: 'InvalidPhoneNumber', retryable: false };
  }

  // Template problems.
  if (code === 132000 || code === 132001 || code === 132005 || code === 132007 || code === 132012 || code === 132015 || code === 132068 || code === 132069) {
    return { code: 'TemplateNotApproved', retryable: false };
  }

  // Outside the 24h customer-care window, or re-engagement required.
  if (code === 131047 || code === 131053 || code === 470) {
    return { code: 'MessageNotAllowed', retryable: false };
  }

  // Malformed request.
  if (code === 100 || code === 131008 || code === 131009 || code === 131021 || httpStatus === 400) {
    return { code: 'InvalidRequest', retryable: false };
  }

  return { code: 'UnknownError', retryable: false };
}
