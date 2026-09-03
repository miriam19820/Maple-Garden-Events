/**
 * Retry classification (§17, §37) — a permanent failure must never be retried,
 * and a transient one must be.
 */

import { classifyMetaError, isRetryableCode, WhatsAppError } from '../../src/Services/whatsapp/errors';

describe('classifyMetaError', () => {
  it.each([
    [401, 190, 'AuthenticationFailed', false],
    [403, 200, 'AuthenticationFailed', false],
    [429, 4, 'RateLimited', true],
    [400, 130429, 'RateLimited', true],
    [500, undefined, 'ProviderUnavailable', true],
    [503, 2, 'ProviderUnavailable', true],
    [400, 131026, 'InvalidPhoneNumber', false],
    [400, 132001, 'TemplateNotApproved', false],
    [400, 131047, 'MessageNotAllowed', false],
    [400, 100, 'InvalidRequest', false],
  ])('maps HTTP %s / code %s to %s (retryable=%s)', (status, code, expected, retryable) => {
    const result = classifyMetaError(status, code);
    expect(result.code).toBe(expected);
    expect(result.retryable).toBe(retryable);
  });

  it('treats an unrecognised failure as permanent rather than looping forever', () => {
    const result = classifyMetaError(418, 999999);
    expect(result.code).toBe('UnknownError');
    expect(result.retryable).toBe(false);
  });
});

describe('isRetryableCode', () => {
  it('allows exactly the three transient codes', () => {
    expect(isRetryableCode('NetworkError')).toBe(true);
    expect(isRetryableCode('RateLimited')).toBe(true);
    expect(isRetryableCode('ProviderUnavailable')).toBe(true);
  });

  it.each(['InvalidPhoneNumber', 'TemplateNotApproved', 'AuthenticationFailed', 'InvalidRequest'] as const)(
    'refuses to retry %s',
    (code) => {
      expect(isRetryableCode(code)).toBe(false);
    },
  );
});

describe('WhatsAppError', () => {
  it('carries the project AppError shape with a sensible status code', () => {
    const error = new WhatsAppError('InvalidPhoneNumber', 'bad number');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('InvalidPhoneNumber');
    expect(error.isOperational).toBe(true);
    expect(error.retryable).toBe(false);
  });

  it('keeps provider internals in context, not in the message', () => {
    const error = new WhatsAppError('ProviderUnavailable', 'Provider is unavailable.', {
      fbtraceId: 'abc',
    });
    expect(error.message).not.toContain('abc');
    expect(error.context).toEqual({ fbtraceId: 'abc' });
  });
});
