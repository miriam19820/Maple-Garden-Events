/**
 * Provider resolution (§10).
 *
 * The rest of the application never constructs a provider directly — it calls
 * `getWhatsAppProvider()` so the implementation can be swapped by configuration.
 */

import { getWhatsAppConfig, type WhatsAppProviderName } from '../../../config/whatsapp.config';
import { logger } from '../../../utils/logger';
import type { IWhatsAppProvider } from '../types';
import { FakeWhatsAppProvider } from './fakeProvider';
import { MetaWhatsAppProvider } from './metaProvider';

export { FakeWhatsAppProvider } from './fakeProvider';
export { MetaWhatsAppProvider } from './metaProvider';

/**
 * A provider that refuses everything — used when WhatsApp is switched off entirely.
 * Distinct from the fake provider, which pretends to succeed.
 */
class DisabledWhatsAppProvider implements IWhatsAppProvider {
  readonly name = 'disabled';
  isConfigured(): boolean {
    return false;
  }
  private refuse() {
    return Promise.resolve({
      ok: false as const,
      provider: this.name,
      code: 'WhatsAppNotConfigured' as const,
      message: 'WhatsApp integration is disabled.',
      retryable: false,
    });
  }
  sendTextAsync = () => this.refuse();
  sendTemplateAsync = () => this.refuse();
  sendDocumentAsync = () => this.refuse();
  sendMediaAsync = () => this.refuse();
  sendInteractiveAsync = () => this.refuse();
  sendAsync = () => this.refuse();
  uploadMediaAsync = () =>
    Promise.resolve({
      ok: false as const,
      provider: this.name,
      code: 'WhatsAppNotConfigured' as const,
      message: 'WhatsApp integration is disabled.',
      retryable: false,
    });
}

let cached: { key: string; provider: IWhatsAppProvider } | null = null;
/** Set by tests/bootstrap; wins over configuration while non-null. */
let override: IWhatsAppProvider | null = null;

function build(name: WhatsAppProviderName): IWhatsAppProvider {
  switch (name) {
    case 'meta':
      return new MetaWhatsAppProvider();
    case 'fake':
      return new FakeWhatsAppProvider();
    case 'disabled':
    default:
      return new DisabledWhatsAppProvider();
  }
}

export function getWhatsAppProvider(): IWhatsAppProvider {
  if (override) return override;

  const config = getWhatsAppConfig();
  // `enabled: false` overrides the provider choice — nothing goes out (§35).
  const name: WhatsAppProviderName = config.enabled ? config.provider : 'disabled';

  if (cached?.key === name) return cached.provider;

  const provider = build(name);
  cached = { key: name, provider };
  logger.info('WhatsApp provider resolved', { provider: name, enabled: config.enabled });
  return provider;
}

/** Tests / bootstrap: force a specific instance. Pass null to fall back to config. */
export function setWhatsAppProviderForTesting(provider: IWhatsAppProvider | null): void {
  override = provider;
  cached = null;
}

/** Drop the memoised instance so the next call re-reads configuration. */
export function resetWhatsAppProviderCache(): void {
  cached = null;
  override = null;
}
