/**
 * Configuration and secret hygiene (§12, §13, §31, §35).
 */

import {
  describeWhatsAppConfig,
  getWhatsAppConfig,
  isWhatsAppLive,
} from '../../src/config/whatsapp.config';
import { getWhatsAppProvider, resetWhatsAppProviderCache } from '../../src/Services/whatsapp/providers';

const WHATSAPP_VARS = [
  'WHATSAPP_ENABLED',
  'WHATSAPP_PROVIDER',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_WEBHOOK_APP_SECRET',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_API_VERSION',
  'WHATSAPP_GRAPH_VERSION',
];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  resetWhatsAppProviderCache();
  for (const key of WHATSAPP_VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of WHATSAPP_VARS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetWhatsAppProviderCache();
});

describe('defaults', () => {
  it('is disabled out of the box, so a fresh checkout cannot send anything', () => {
    expect(getWhatsAppConfig().enabled).toBe(false);
    expect(isWhatsAppLive()).toBe(false);
  });

  it('chooses the fake provider when no credentials exist', () => {
    expect(getWhatsAppConfig().provider).toBe('fake');
  });

  it('resolves to the disabled provider while WHATSAPP_ENABLED is false', () => {
    process.env.WHATSAPP_PROVIDER = 'meta';
    expect(getWhatsAppProvider().name).toBe('disabled');
  });

  it('pins an explicit Graph API version rather than drifting', () => {
    expect(getWhatsAppConfig().apiVersion).toMatch(/^v\d+\.\d+$/);
  });
});

describe('legacy variable names', () => {
  it('still reads WHATSAPP_TOKEN and WHATSAPP_VERIFY_TOKEN', () => {
    process.env.WHATSAPP_TOKEN = 'legacy-token';
    process.env.WHATSAPP_VERIFY_TOKEN = 'legacy-verify';
    process.env.WHATSAPP_GRAPH_VERSION = 'v20.0';

    const config = getWhatsAppConfig();
    expect(config.accessToken).toBe('legacy-token');
    expect(config.webhookVerifyToken).toBe('legacy-verify');
    expect(config.apiVersion).toBe('v20.0');
  });

  it('prefers the new names when both are present', () => {
    process.env.WHATSAPP_TOKEN = 'legacy';
    process.env.WHATSAPP_ACCESS_TOKEN = 'current';
    expect(getWhatsAppConfig().accessToken).toBe('current');
  });
});

describe('describeWhatsAppConfig', () => {
  it('reports presence without ever revealing a secret', () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'meta';
    process.env.WHATSAPP_ACCESS_TOKEN = 'super-secret-token-value';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.WHATSAPP_WEBHOOK_APP_SECRET = 'app-secret-value';

    const described = describeWhatsAppConfig();
    const serialized = JSON.stringify(described);

    expect(described.accessTokenConfigured).toBe(true);
    expect(described.webhookAppSecretConfigured).toBe(true);
    expect(described.live).toBe(true);

    // The whole point of this shape: safe to log and safe to return over HTTP.
    expect(serialized).not.toContain('super-secret-token-value');
    expect(serialized).not.toContain('app-secret-value');
    expect(serialized).not.toContain('accessToken"');
  });

  it('marks the integration degraded when credentials are missing', () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'meta';
    expect(describeWhatsAppConfig().live).toBe(false);
  });
});
