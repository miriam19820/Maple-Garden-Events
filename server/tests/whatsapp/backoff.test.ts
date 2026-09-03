/**
 * Exponential backoff (§17) — grows, is capped, and always respects Retry-After.
 */

import { computeBackoffMs } from '../../src/Services/whatsapp/outbox.service';
import type { WhatsAppRetryConfig } from '../../src/config/whatsapp.config';

const retry: WhatsAppRetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  jitterRatio: 0,
};

describe('computeBackoffMs', () => {
  it('doubles with each attempt', () => {
    expect(computeBackoffMs(1, retry)).toBe(1000);
    expect(computeBackoffMs(2, retry)).toBe(2000);
    expect(computeBackoffMs(3, retry)).toBe(4000);
    expect(computeBackoffMs(4, retry)).toBe(8000);
  });

  it('never exceeds maxDelayMs', () => {
    expect(computeBackoffMs(50, retry)).toBe(60000);
  });

  it('honours the provider Retry-After above its own schedule', () => {
    expect(computeBackoffMs(1, retry, 30)).toBe(30000);
  });

  it('caps Retry-After at maxDelayMs so a hostile value cannot stall the queue', () => {
    expect(computeBackoffMs(1, retry, 99999)).toBe(60000);
  });

  it('stays within the jitter band and never goes below one second', () => {
    const jittered = { ...retry, jitterRatio: 0.2 };
    for (let i = 0; i < 200; i += 1) {
      const delay = computeBackoffMs(3, jittered);
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeGreaterThanOrEqual(4000 * 0.8 - 1);
      expect(delay).toBeLessThanOrEqual(4000 * 1.2 + 1);
    }
  });
});
