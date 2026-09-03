/**
 * Registers the WhatsApp background workers on the existing node-cron
 * infrastructure (§26). Every worker is a no-op while WHATSAPP_ENABLED is false,
 * so this can be registered unconditionally.
 *
 * The workers are idempotent and concurrency-safe (claim-based), so running them on
 * several app instances is fine.
 */

import cron from 'node-cron';
import { getWhatsAppConfig } from '../config/whatsapp.config';
import { logger } from './logger';
import { reportBackgroundFailure } from '../Services/criticalAlert.service';
import {
  cleanupWhatsAppWebhookEvents,
  runWhatsAppAutomationWorker,
  runWhatsAppOutboxWorker,
} from '../Services/whatsapp';
import { runWhatsAppWebhookWorker } from '../Services/whatsapp/webhookProcessor';

/** Guards against overlapping ticks within one process. */
function once(name: string, fn: () => Promise<unknown>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      logger.debug(`WhatsApp worker "${name}" still running — skipping this tick`);
      return;
    }
    running = true;
    try {
      await fn();
    } catch (error) {
      logger.error(`WhatsApp worker "${name}" failed`, { error });
      reportBackgroundFailure(`whatsapp-${name}`, error);
    } finally {
      running = false;
    }
  };
}

export function startWhatsAppCronJobs(): void {
  const config = getWhatsAppConfig();

  const outboxSchedule = process.env.WHATSAPP_OUTBOX_CRON || '* * * * *';
  const webhookSchedule = process.env.WHATSAPP_WEBHOOK_CRON || '* * * * *';
  const automationSchedule = process.env.WHATSAPP_AUTOMATION_CRON || '30 8 * * *';
  const cleanupSchedule = process.env.WHATSAPP_CLEANUP_CRON || '30 3 * * *';

  // Outbox: drain queued messages every minute.
  cron.schedule(
    outboxSchedule,
    once('outbox', async () => {
      const summary = await runWhatsAppOutboxWorker();
      if (summary.claimed > 0) logger.info('[WHATSAPP] outbox tick', summary);
    }),
  );

  // Webhook events: retries failed inline processing, and is the primary path when
  // WHATSAPP_ASYNC_WEBHOOK=true.
  cron.schedule(
    webhookSchedule,
    once('webhook', async () => {
      const summary = await runWhatsAppWebhookWorker();
      if (summary.claimed > 0) logger.info('[WHATSAPP] webhook tick', summary);
    }),
  );

  // Scheduled automations (payment overdue, event approaching).
  cron.schedule(
    automationSchedule,
    once('automation', async () => {
      const summary = await runWhatsAppAutomationWorker();
      if (!summary.skippedRun) logger.info('[WHATSAPP] automation tick', summary);
    }),
  );

  // Retention for raw webhook payloads (§44).
  cron.schedule(
    cleanupSchedule,
    once('cleanup', async () => {
      await cleanupWhatsAppWebhookEvents();
    }),
  );

  logger.info('WhatsApp cron jobs registered', {
    enabled: config.enabled,
    provider: config.provider,
    outboxSchedule,
    webhookSchedule,
    automationSchedule,
    cleanupSchedule,
  });
}
