/**
 * Strongly-typed WhatsApp configuration (§12).
 *
 * SECRETS ARE READ FROM THE ENVIRONMENT ONLY — never from committed files, and
 * never logged. `describeWhatsAppConfig()` is the only shape safe to expose.
 *
 * Backwards compatible with the pre-existing WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID
 * / WHATSAPP_VERIFY_TOKEN / WHATSAPP_APP_SECRET / WHATSAPP_GRAPH_VERSION variables.
 */

export type WhatsAppProviderName = 'meta' | 'fake' | 'disabled';

export type WhatsAppRetryConfig = {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  /** Random ±jitter fraction applied to each backoff delay (0–1). */
  jitterRatio: number;
};

export type WhatsAppFeatureFlags = {
  /** Persist + process webhooks on the worker instead of inside the HTTP request. */
  asyncWebhookProcessing: boolean;
  /** Forward inbound customer messages to the manager's WhatsApp. */
  forwardInboundToManager: boolean;
  /** Let the automation worker actually enqueue messages (vs. dry-run logging). */
  automationEnabled: boolean;
  /** Store the full provider payload on each message row. */
  storeRawPayloads: boolean;
};

export type WhatsAppConfig = {
  enabled: boolean;
  provider: WhatsAppProviderName;
  businessAccountId: string | null;
  phoneNumberId: string | null;
  accessToken: string | null;
  webhookVerifyToken: string | null;
  webhookAppSecret: string | null;
  graphApiBaseUrl: string;
  apiVersion: string;
  timeoutMs: number;
  retry: WhatsAppRetryConfig;
  features: WhatsAppFeatureFlags;
  /** Default template language when a template row does not specify one. */
  defaultLanguage: string;
  /** Manager destination for alert/forwarding automations. */
  managerPhone: string | null;
  /** Outbox worker batch size per tick. */
  outboxBatchSize: number;
  /** Days to keep raw webhook payloads before cleanup (0 = keep forever). */
  webhookRetentionDays: number;
};

function envStr(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function resolveProvider(): WhatsAppProviderName {
  const explicit = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (explicit === 'meta' || explicit === 'fake' || explicit === 'disabled') return explicit;

  // No explicit choice: only go live when real credentials exist AND we are in
  // production. Development and tests default to the fake provider (§35).
  const hasCredentials = !!(envStr('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_TOKEN') && envStr('WHATSAPP_PHONE_NUMBER_ID'));
  if (process.env.NODE_ENV === 'production' && hasCredentials) return 'meta';
  return hasCredentials && process.env.NODE_ENV !== 'test' ? 'meta' : 'fake';
}

/**
 * Latest Graph API at time of writing is v26.0 (2026-07-29). We pin v25.0
 * (2026-02-18, supported until 2028-07-29) as a stable default; override with
 * WHATSAPP_API_VERSION. See docs/whatsapp/configuration.md.
 */
const DEFAULT_API_VERSION = 'v25.0';

export function loadWhatsAppConfig(): WhatsAppConfig {
  const provider = resolveProvider();
  return {
    // Default OFF: a fresh checkout never sends anything (§35).
    enabled: envBool('WHATSAPP_ENABLED', false),
    provider,
    businessAccountId: envStr('WHATSAPP_BUSINESS_ACCOUNT_ID'),
    phoneNumberId: envStr('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: envStr('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_TOKEN'),
    webhookVerifyToken: envStr('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'WHATSAPP_VERIFY_TOKEN'),
    webhookAppSecret: envStr('WHATSAPP_WEBHOOK_APP_SECRET', 'WHATSAPP_APP_SECRET'),
    graphApiBaseUrl: envStr('WHATSAPP_GRAPH_API_BASE_URL') ?? 'https://graph.facebook.com',
    apiVersion: envStr('WHATSAPP_API_VERSION', 'WHATSAPP_GRAPH_VERSION') ?? DEFAULT_API_VERSION,
    timeoutMs: envInt('WHATSAPP_TIMEOUT_MS', 15000),
    retry: {
      maxAttempts: envInt('WHATSAPP_RETRY_MAX_ATTEMPTS', 5),
      initialDelayMs: envInt('WHATSAPP_RETRY_INITIAL_DELAY_MS', 30000),
      maxDelayMs: envInt('WHATSAPP_RETRY_MAX_DELAY_MS', 3600000),
      jitterRatio: 0.2,
    },
    features: {
      asyncWebhookProcessing: envBool('WHATSAPP_ASYNC_WEBHOOK', false),
      forwardInboundToManager: envBool('WHATSAPP_FORWARD_INBOUND_TO_MANAGER', true),
      automationEnabled: envBool('WHATSAPP_AUTOMATION_ENABLED', false),
      storeRawPayloads: envBool('WHATSAPP_STORE_RAW_PAYLOADS', true),
    },
    defaultLanguage: envStr('WHATSAPP_DEFAULT_LANGUAGE') ?? 'he',
    managerPhone: envStr('MANAGER_ALERT_PHONE', 'MANAGER_PHONE'),
    outboxBatchSize: envInt('WHATSAPP_OUTBOX_BATCH_SIZE', 20),
    webhookRetentionDays: envInt('WHATSAPP_WEBHOOK_RETENTION_DAYS', 90),
  };
}

/** Read fresh each call so tests can flip env vars between cases. */
export function getWhatsAppConfig(): WhatsAppConfig {
  return loadWhatsAppConfig();
}

/** True when live sending is both switched on and actually usable. */
export function isWhatsAppLive(config = getWhatsAppConfig()): boolean {
  return config.enabled && config.provider === 'meta' && !!config.accessToken && !!config.phoneNumberId;
}

/** Secret-free summary for health checks, the settings UI, and logs (§31, §32). */
export function describeWhatsAppConfig(config = getWhatsAppConfig()): Record<string, unknown> {
  return {
    enabled: config.enabled,
    provider: config.provider,
    apiVersion: config.apiVersion,
    graphApiBaseUrl: config.graphApiBaseUrl,
    phoneNumberIdConfigured: !!config.phoneNumberId,
    businessAccountIdConfigured: !!config.businessAccountId,
    accessTokenConfigured: !!config.accessToken,
    webhookVerifyTokenConfigured: !!config.webhookVerifyToken,
    webhookAppSecretConfigured: !!config.webhookAppSecret,
    managerPhoneConfigured: !!config.managerPhone,
    timeoutMs: config.timeoutMs,
    retry: config.retry,
    features: config.features,
    live: isWhatsAppLive(config),
  };
}
