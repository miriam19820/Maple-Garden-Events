/**
 * WhatsApp counters (§32), following the in-process style of utils/apmMetrics.ts.
 * Exposed through the readiness/metrics endpoints — never contains secrets or content.
 */

export const WHATSAPP_METRICS = [
  'whatsapp_messages_sent',
  'whatsapp_messages_failed',
  'whatsapp_messages_delivered',
  'whatsapp_messages_read',
  'whatsapp_messages_received',
  'whatsapp_webhook_received',
  'whatsapp_webhook_duplicate',
  'whatsapp_webhook_failed',
  'whatsapp_outbox_enqueued',
  'whatsapp_outbox_retry',
  'whatsapp_outbox_dead',
  'whatsapp_automation_executed',
] as const;

export type WhatsAppMetric = (typeof WHATSAPP_METRICS)[number];

const counters: Record<WhatsAppMetric, number> = WHATSAPP_METRICS.reduce(
  (acc, key) => ({ ...acc, [key]: 0 }),
  {} as Record<WhatsAppMetric, number>,
);

export function recordWhatsAppMetric(metric: WhatsAppMetric, by = 1): void {
  counters[metric] += by;
}

export function getWhatsAppMetrics(): Record<WhatsAppMetric, number> {
  return { ...counters };
}

export function resetWhatsAppMetrics(): void {
  for (const key of WHATSAPP_METRICS) counters[key] = 0;
}
