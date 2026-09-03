/**
 * WhatsApp health snapshot (§32).
 * Contains NO secrets — only booleans about whether each secret is present.
 */

import { describeWhatsAppConfig, getWhatsAppConfig, isWhatsAppLive } from '../../config/whatsapp.config';
import { getWhatsAppMetrics } from './metrics';
import { getOutboxStats } from './outbox.service';

export type WhatsAppHealth = {
  status: 'ok' | 'degraded' | 'disabled';
  config: Record<string, unknown>;
  outbox: Record<string, number>;
  metrics: Record<string, number>;
  issues: string[];
};

export async function getWhatsAppHealth(tenantId?: string): Promise<WhatsAppHealth> {
  const config = getWhatsAppConfig();
  const issues: string[] = [];

  if (!config.enabled) {
    return {
      status: 'disabled',
      config: describeWhatsAppConfig(config),
      outbox: {},
      metrics: getWhatsAppMetrics(),
      issues: [],
    };
  }

  if (config.provider === 'meta') {
    if (!config.accessToken) issues.push('WHATSAPP_ACCESS_TOKEN is missing');
    if (!config.phoneNumberId) issues.push('WHATSAPP_PHONE_NUMBER_ID is missing');
    if (!config.webhookVerifyToken) issues.push('WHATSAPP_WEBHOOK_VERIFY_TOKEN is missing');
    if (!config.webhookAppSecret) issues.push('WHATSAPP_WEBHOOK_APP_SECRET is missing');
  }

  const outbox: Record<string, number> = await getOutboxStats(tenantId).catch(
    () => ({}) as Record<string, number>,
  );

  // A growing dead-letter pile is the signal worth surfacing.
  if ((outbox.Failed ?? 0) > 0) issues.push(`${outbox.Failed} outbox message(s) failed permanently`);

  return {
    status: issues.length === 0 && isWhatsAppLive(config) ? 'ok' : 'degraded',
    config: describeWhatsAppConfig(config),
    outbox,
    metrics: getWhatsAppMetrics(),
    issues,
  };
}
