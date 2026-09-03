/**
 * The fake provider must never touch the network and must be deterministic (§36).
 */

import { FakeWhatsAppProvider } from '../../src/Services/whatsapp/providers/fakeProvider';

describe('FakeWhatsAppProvider', () => {
  let provider: FakeWhatsAppProvider;
  const realFetch = global.fetch;

  beforeEach(() => {
    provider = new FakeWhatsAppProvider();
    // Any network call at all is a test failure.
    global.fetch = jest.fn(() => {
      throw new Error('The fake provider must never perform network I/O');
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns deterministic, incrementing message ids', async () => {
    const first = await provider.sendTextAsync({ kind: 'text', to: '972501234567', body: 'a' });
    const second = await provider.sendTextAsync({ kind: 'text', to: '972501234567', body: 'b' });

    expect(first).toEqual({ ok: true, externalMessageId: 'fake.wamid.000001', provider: 'fake' });
    expect(second.ok && second.externalMessageId).toBe('fake.wamid.000002');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('records every send so tests can assert on them', async () => {
    await provider.sendTemplateAsync({
      kind: 'template',
      to: '972501234567',
      templateName: 'contract_signed',
      languageCode: 'he',
    });

    const sent = provider.getSentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0].request).toMatchObject({ kind: 'template', templateName: 'contract_signed' });
    expect(sent[0].ok).toBe(true);
  });

  it('supports all five sendable kinds', async () => {
    await provider.sendTextAsync({ kind: 'text', to: '9725', body: 'x' });
    await provider.sendTemplateAsync({ kind: 'template', to: '9725', templateName: 't', languageCode: 'he' });
    await provider.sendDocumentAsync({ kind: 'document', to: '9725', filename: 'f.pdf', link: 'https://x/f.pdf' });
    await provider.sendMediaAsync({ kind: 'media', to: '9725', mediaType: 'image', link: 'https://x/i.png' });
    await provider.sendInteractiveAsync({ kind: 'interactive', to: '9725', interactive: {} });
    expect(provider.getSentMessages()).toHaveLength(5);
  });

  it('fails exactly once when a one-shot failure is queued', async () => {
    provider.failNext({ code: 'RateLimited', message: 'slow down', retryable: true, retryAfterSec: 30 });

    const failed = await provider.sendTextAsync({ kind: 'text', to: '9725', body: 'a' });
    expect(failed).toMatchObject({ ok: false, code: 'RateLimited', retryable: true, retryAfterSec: 30 });

    const recovered = await provider.sendTextAsync({ kind: 'text', to: '9725', body: 'b' });
    expect(recovered.ok).toBe(true);
  });

  it('keeps failing while a sticky failure is set', async () => {
    provider.failNext({ code: 'InvalidPhoneNumber', message: 'bad', retryable: false, sticky: true });
    expect((await provider.sendTextAsync({ kind: 'text', to: '9725', body: 'a' })).ok).toBe(false);
    expect((await provider.sendTextAsync({ kind: 'text', to: '9725', body: 'b' })).ok).toBe(false);
    provider.succeedFrom();
    expect((await provider.sendTextAsync({ kind: 'text', to: '9725', body: 'c' })).ok).toBe(true);
  });

  it('returns a deterministic media id on upload', async () => {
    const result = await provider.uploadMediaAsync(Buffer.from('pdf'), 'a.pdf', 'application/pdf');
    expect(result).toEqual({ ok: true, mediaId: 'fake.media.000001', provider: 'fake' });
    expect(provider.getUploads()[0]).toEqual({ filename: 'a.pdf', mimeType: 'application/pdf', bytes: 3 });
  });

  it('clears all state on reset', async () => {
    await provider.sendTextAsync({ kind: 'text', to: '9725', body: 'a' });
    provider.reset();
    expect(provider.getSentMessages()).toHaveLength(0);
    const next = await provider.sendTextAsync({ kind: 'text', to: '9725', body: 'b' });
    expect(next.ok && next.externalMessageId).toBe('fake.wamid.000001');
  });
});
