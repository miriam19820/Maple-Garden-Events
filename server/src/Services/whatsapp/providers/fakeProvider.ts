/**
 * In-memory WhatsApp provider for local development and automated tests (§36).
 *
 * NEVER performs network I/O — it is impossible for a test to send a real message
 * through this class. Returns deterministic ids so assertions are stable.
 */

import { logger } from '../../../utils/logger';
import type { WhatsAppErrorCode } from '../errors';
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

export type RecordedSend = {
  request: SendRequest;
  externalMessageId: string | null;
  at: Date;
  ok: boolean;
};

export type FakeFailure = {
  code: WhatsAppErrorCode;
  message: string;
  retryable: boolean;
  retryAfterSec?: number;
};

export class FakeWhatsAppProvider implements IWhatsAppProvider {
  readonly name = 'fake';

  private counter = 0;
  private readonly sent: RecordedSend[] = [];
  private readonly uploads: { filename: string; mimeType: string; bytes: number }[] = [];

  /** When set, the next send fails with this. Consumed once unless `sticky`. */
  private queuedFailure: (FakeFailure & { sticky?: boolean }) | null = null;

  /** Deterministic id: fake.wamid.000001 */
  private nextId(): string {
    this.counter += 1;
    return `fake.wamid.${String(this.counter).padStart(6, '0')}`;
  }

  isConfigured(): boolean {
    return true;
  }

  /** Test hook: make the next send (or all sends, if sticky) fail. */
  failNext(failure: FakeFailure & { sticky?: boolean }): void {
    this.queuedFailure = failure;
  }

  /** Test hook: clear any queued failure. */
  succeedFrom(): void {
    this.queuedFailure = null;
  }

  /** Test hook: everything this provider was asked to send. */
  getSentMessages(): ReadonlyArray<RecordedSend> {
    return this.sent;
  }

  getUploads(): ReadonlyArray<{ filename: string; mimeType: string; bytes: number }> {
    return this.uploads;
  }

  /** Test hook: forget all recorded state. */
  reset(): void {
    this.counter = 0;
    this.sent.length = 0;
    this.uploads.length = 0;
    this.queuedFailure = null;
  }

  private record(request: SendRequest): SendResult {
    const failure = this.queuedFailure;
    if (failure) {
      if (!failure.sticky) this.queuedFailure = null;
      this.sent.push({ request, externalMessageId: null, at: new Date(), ok: false });
      return {
        ok: false,
        provider: this.name,
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
        retryAfterSec: failure.retryAfterSec,
      };
    }

    const externalMessageId = this.nextId();
    this.sent.push({ request, externalMessageId, at: new Date(), ok: true });
    logger.info('[fake-whatsapp] message accepted', {
      kind: request.kind,
      to: request.to,
      externalMessageId,
    });
    return { ok: true, externalMessageId, provider: this.name };
  }

  sendTextAsync(req: SendTextRequest): Promise<SendResult> {
    return Promise.resolve(this.record(req));
  }

  sendTemplateAsync(req: SendTemplateRequest): Promise<SendResult> {
    return Promise.resolve(this.record(req));
  }

  sendDocumentAsync(req: SendDocumentRequest): Promise<SendResult> {
    return Promise.resolve(this.record(req));
  }

  sendMediaAsync(req: SendMediaRequest): Promise<SendResult> {
    return Promise.resolve(this.record(req));
  }

  sendInteractiveAsync(req: SendInteractiveRequest): Promise<SendResult> {
    return Promise.resolve(this.record(req));
  }

  sendAsync(req: SendRequest): Promise<SendResult> {
    return Promise.resolve(this.record(req));
  }

  uploadMediaAsync(buffer: Buffer, filename: string, mimeType: string): Promise<MediaUploadResult> {
    this.uploads.push({ filename, mimeType, bytes: buffer.length });
    return Promise.resolve({
      ok: true,
      mediaId: `fake.media.${String(this.uploads.length).padStart(6, '0')}`,
      provider: this.name,
    });
  }
}
