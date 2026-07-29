import { logger } from '../utils/logger';
import { captureException, captureMessage, isSentryEnabled } from '../config/sentry';
import { recordCriticalAlertSent } from '../utils/apmMetrics';

export type CriticalAlertSeverity = 'critical' | 'error';

export type CriticalAlertPayload = {
  title: string;
  message: string;
  severity?: CriticalAlertSeverity;
  source?: string;
  context?: Record<string, unknown>;
  error?: unknown;
};

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const lastSentByKey = new Map<string, number>();

function cooldownMs(): number {
  const raw = Number(process.env.ALERT_COOLDOWN_MS ?? DEFAULT_COOLDOWN_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_COOLDOWN_MS;
}

function alertKey(payload: CriticalAlertPayload): string {
  return `${payload.source || 'app'}:${payload.title}:${payload.message}`.slice(0, 300);
}

function shouldSend(key: string): boolean {
  const now = Date.now();
  const prev = lastSentByKey.get(key) ?? 0;
  if (now - prev < cooldownMs()) return false;
  lastSentByKey.set(key, now);
  return true;
}

function resolveAlertEmail(): string | undefined {
  return (
    process.env.MANAGER_ALERT_EMAIL?.trim() ||
    process.env.MANAGER_EMAIL?.trim() ||
    undefined
  );
}

async function postWebhook(body: Record<string, unknown>): Promise<boolean> {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn('Critical alert webhook non-OK response', { status: res.status });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn('Critical alert webhook failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function sendAlertEmail(payload: CriticalAlertPayload): Promise<boolean> {
  const to = resolveAlertEmail();
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  if (!to || !user || !pass) return false;

  try {
    // Lazy import avoids circular deps with mailer ↔ branding during boot.
    const { deliverMail } = await import('../utils/mailer');
    const severity = payload.severity || 'critical';
    const result = await deliverMail(
      {
        to,
        subject: `[${severity.toUpperCase()}] ${payload.title}`,
        html: `
        <div dir="rtl" style="font-family: sans-serif;">
          <h2>${payload.title}</h2>
          <p>${payload.message}</p>
          <pre style="background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap;">
${JSON.stringify(
  {
    source: payload.source,
    severity,
    context: payload.context,
    error:
      payload.error instanceof Error
        ? { name: payload.error.name, message: payload.error.message, stack: payload.error.stack }
        : payload.error,
    at: new Date().toISOString(),
    tenant: process.env.TENANT_NAME || 'default',
    env: process.env.NODE_ENV || 'development',
  },
  null,
  2,
)}
          </pre>
        </div>
      `,
      },
      'Critical ops alert',
    );
    return !!result?.ok;
  } catch (error) {
    logger.warn('Critical alert email failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Fire-and-forget critical alert (webhook + optional email + Sentry).
 * Deduped by title/message for ALERT_COOLDOWN_MS (default 5 minutes).
 */
export async function notifyCriticalAlert(payload: CriticalAlertPayload): Promise<void> {
  const key = alertKey(payload);
  if (!shouldSend(key)) {
    logger.info('Critical alert suppressed (cooldown)', { key: key.slice(0, 80) });
    return;
  }

  const severity = payload.severity || 'critical';
  logger.error('CRITICAL ALERT', {
    title: payload.title,
    message: payload.message,
    source: payload.source,
    severity,
    context: payload.context,
  });

  if (payload.error) {
    captureException(payload.error, {
      alertTitle: payload.title,
      source: payload.source,
      ...payload.context,
    });
  } else if (isSentryEnabled()) {
    captureMessage(`[${severity}] ${payload.title}: ${payload.message}`, 'error');
  }

  const body = {
    type: 'maple.critical_alert',
    title: payload.title,
    message: payload.message,
    severity,
    source: payload.source || 'server',
    context: payload.context || {},
    tenant: process.env.TENANT_NAME || 'default',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  };

  const [webhookOk, emailOk] = await Promise.all([postWebhook(body), sendAlertEmail(payload)]);
  if (webhookOk || emailOk) {
    recordCriticalAlertSent();
  }
}

/** Report cron / background job failures to logs + Sentry + alerts. */
export function reportBackgroundFailure(
  jobName: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Background job failed: ${jobName}`, { error: message, ...context });
  void notifyCriticalAlert({
    title: `Cron/job failed: ${jobName}`,
    message,
    severity: 'error',
    source: `cron:${jobName}`,
    context,
    error,
  });
}
