/**
 * Meta WhatsApp Cloud API provider (Graph API).
 *
 * Endpoints used (official Cloud API reference):
 *   POST {base}/{version}/{phone-number-id}/messages   — send
 *   POST {base}/{version}/{phone-number-id}/media      — upload media, returns { id }
 *
 * This is the ONLY file that knows Meta's wire format. Everything above it speaks
 * the SendRequest / SendResult vocabulary in ../types.ts.
 */

import { getWhatsAppConfig, type WhatsAppConfig } from '../../../config/whatsapp.config';
import { logger } from '../../../utils/logger';
import { reportIntegrationFailure } from '../../../utils/reportUnexpectedError';
import { classifyMetaError, type WhatsAppErrorCode } from '../errors';
import type {
  IWhatsAppProvider,
  MediaUploadResult,
  SendDocumentRequest,
  SendInteractiveRequest,
  SendMediaRequest,
  SendRequest,
  SendResult,
  SendTemplateRequest,
  SendTextRequest,
} from '../types';

type GraphResponse = {
  messages?: { id?: string; message_status?: string }[];
  id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
    fbtrace_id?: string;
  };
};

export class MetaWhatsAppProvider implements IWhatsAppProvider {
  readonly name = 'meta';

  constructor(private readonly configProvider: () => WhatsAppConfig = getWhatsAppConfig) {}

  private get config(): WhatsAppConfig {
    return this.configProvider();
  }

  isConfigured(): boolean {
    const c = this.config;
    return !!(c.accessToken && c.phoneNumberId);
  }

  private endpoint(path: string): string {
    const c = this.config;
    return `${c.graphApiBaseUrl.replace(/\/+$/, '')}/${c.apiVersion}/${c.phoneNumberId}/${path}`;
  }

  private notConfigured(): SendResult {
    return {
      ok: false,
      provider: this.name,
      code: 'WhatsAppNotConfigured',
      message: 'WhatsApp Cloud API credentials are not configured.',
      retryable: false,
    };
  }

  /** Meta returns Retry-After in seconds on some throttling responses. */
  private static parseRetryAfter(res: Response): number | undefined {
    const header = res.headers.get('retry-after');
    if (!header) return undefined;
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  }

  private async post(path: string, body: BodyInit, extraHeaders: Record<string, string> = {}): Promise<
    { res: Response; data: GraphResponse } | { networkError: unknown }
  > {
    const c = this.config;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), c.timeoutMs);
    try {
      const res = await fetch(this.endpoint(path), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${c.accessToken}`,
          ...extraHeaders,
        },
        body,
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as GraphResponse;
      return { res, data };
    } catch (error) {
      return { networkError: error };
    } finally {
      clearTimeout(timer);
    }
  }

  private failure(
    code: WhatsAppErrorCode,
    message: string,
    retryable: boolean,
    extra: Partial<Extract<SendResult, { ok: false }>> = {},
  ): SendResult {
    return { ok: false, provider: this.name, code, message, retryable, ...extra };
  }

  private async sendPayload(payload: Record<string, unknown>, operation: string): Promise<SendResult> {
    if (!this.isConfigured()) return this.notConfigured();

    const outcome = await this.post('messages', JSON.stringify(payload), {
      'Content-Type': 'application/json',
    });

    if ('networkError' in outcome) {
      const error = outcome.networkError;
      const aborted = error instanceof Error && error.name === 'AbortError';
      // Never log the payload body — it can contain customer message content (§31, §44).
      logger.error('WhatsApp Cloud API request failed', {
        operation,
        reason: aborted ? 'timeout' : 'network',
      });
      reportIntegrationFailure('whatsapp', error, {
        operation,
        reason: aborted ? 'timeout' : 'network',
        context: { type: payload.type },
      });
      return this.failure(
        'NetworkError',
        aborted ? 'WhatsApp request timed out.' : 'WhatsApp request failed to reach the provider.',
        true,
      );
    }

    const { res, data } = outcome;

    if (!res.ok || data.error) {
      const { code, retryable } = classifyMetaError(res.status, data.error?.code, data.error?.error_subcode);
      const message = data.error?.message || `HTTP ${res.status}`;
      logger.error('WhatsApp Cloud API returned an error', {
        operation,
        httpStatus: res.status,
        providerCode: data.error?.code,
        providerSubcode: data.error?.error_subcode,
        classified: code,
        retryable,
        fbtraceId: data.error?.fbtrace_id,
      });
      if (!retryable) {
        reportIntegrationFailure('whatsapp', new Error(message), {
          operation,
          reason: String(data.error?.code ?? res.status),
          context: { httpStatus: res.status, classified: code },
        });
      }
      return this.failure(code, message, retryable, {
        httpStatus: res.status,
        providerCode: data.error?.code,
        retryAfterSec: MetaWhatsAppProvider.parseRetryAfter(res),
      });
    }

    const externalMessageId = data.messages?.[0]?.id;
    if (!externalMessageId) {
      logger.error('WhatsApp Cloud API accepted the request but returned no message id', { operation });
      return this.failure('UnknownError', 'Provider returned no message id.', false);
    }

    logger.info('WhatsApp message accepted by provider', {
      operation,
      externalMessageId,
      type: payload.type,
    });
    return { ok: true, externalMessageId, provider: this.name };
  }

  private static recipient(to: string, extra: Record<string, unknown>): Record<string, unknown> {
    return { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...extra };
  }

  sendTextAsync(req: SendTextRequest): Promise<SendResult> {
    return this.sendPayload(
      MetaWhatsAppProvider.recipient(req.to, {
        type: 'text',
        text: { preview_url: req.previewUrl ?? false, body: req.body },
      }),
      'sendText',
    );
  }

  sendTemplateAsync(req: SendTemplateRequest): Promise<SendResult> {
    return this.sendPayload(
      MetaWhatsAppProvider.recipient(req.to, {
        type: 'template',
        template: {
          name: req.templateName,
          language: { code: req.languageCode },
          ...(req.components?.length ? { components: req.components } : {}),
        },
      }),
      'sendTemplate',
    );
  }

  async sendDocumentAsync(req: SendDocumentRequest): Promise<SendResult> {
    let mediaId = req.mediaId;

    if (!mediaId && req.base64) {
      const uploaded = await this.uploadMediaAsync(
        Buffer.from(req.base64, 'base64'),
        req.filename,
        req.mimeType ?? 'application/pdf',
      );
      if (!uploaded.ok) {
        return this.failure(uploaded.code, uploaded.message, uploaded.retryable);
      }
      mediaId = uploaded.mediaId;
    }

    if (!mediaId && !req.link) {
      return this.failure('InvalidRequest', 'A document needs mediaId, link, or base64 content.', false);
    }

    const document: Record<string, string> = { filename: req.filename };
    if (mediaId) document.id = mediaId;
    else if (req.link) document.link = req.link;
    if (req.caption) document.caption = req.caption;

    return this.sendPayload(
      MetaWhatsAppProvider.recipient(req.to, { type: 'document', document }),
      'sendDocument',
    );
  }

  sendMediaAsync(req: SendMediaRequest): Promise<SendResult> {
    if (!req.mediaId && !req.link) {
      return Promise.resolve(this.failure('InvalidRequest', 'Media needs mediaId or link.', false));
    }
    const media: Record<string, string> = {};
    if (req.mediaId) media.id = req.mediaId;
    else if (req.link) media.link = req.link;
    // Stickers do not accept a caption.
    if (req.caption && req.mediaType !== 'sticker') media.caption = req.caption;

    return this.sendPayload(
      MetaWhatsAppProvider.recipient(req.to, { type: req.mediaType, [req.mediaType]: media }),
      'sendMedia',
    );
  }

  sendInteractiveAsync(req: SendInteractiveRequest): Promise<SendResult> {
    return this.sendPayload(
      MetaWhatsAppProvider.recipient(req.to, { type: 'interactive', interactive: req.interactive }),
      'sendInteractive',
    );
  }

  sendAsync(req: SendRequest): Promise<SendResult> {
    switch (req.kind) {
      case 'text':
        return this.sendTextAsync(req);
      case 'template':
        return this.sendTemplateAsync(req);
      case 'document':
        return this.sendDocumentAsync(req);
      case 'media':
        return this.sendMediaAsync(req);
      case 'interactive':
        return this.sendInteractiveAsync(req);
      default: {
        const exhaustive: never = req;
        return Promise.resolve(
          this.failure('InvalidRequest', `Unsupported send request: ${JSON.stringify(exhaustive)}`, false),
        );
      }
    }
  }

  async uploadMediaAsync(buffer: Buffer, filename: string, mimeType: string): Promise<MediaUploadResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        provider: this.name,
        code: 'WhatsAppNotConfigured',
        message: 'WhatsApp Cloud API credentials are not configured.',
        retryable: false,
      };
    }

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([Uint8Array.from(buffer)], { type: mimeType }), filename);

    const outcome = await this.post('media', form);

    if ('networkError' in outcome) {
      reportIntegrationFailure('whatsapp', outcome.networkError, {
        operation: 'uploadMedia',
        reason: 'network',
        context: { filename },
      });
      return {
        ok: false,
        provider: this.name,
        code: 'NetworkError',
        message: 'Media upload failed to reach the provider.',
        retryable: true,
      };
    }

    const { res, data } = outcome;
    if (!res.ok || !data.id) {
      const { code, retryable } = classifyMetaError(res.status, data.error?.code, data.error?.error_subcode);
      logger.error('WhatsApp media upload failed', {
        httpStatus: res.status,
        providerCode: data.error?.code,
        classified: code,
        filename,
      });
      return {
        ok: false,
        provider: this.name,
        code: code === 'UnknownError' ? 'MediaUploadFailed' : code,
        message: data.error?.message || `HTTP ${res.status}`,
        retryable,
      };
    }

    return { ok: true, mediaId: data.id, provider: this.name };
  }
}
