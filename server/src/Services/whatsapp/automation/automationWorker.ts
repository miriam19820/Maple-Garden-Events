/**
 * Scheduled automation worker (§26).
 *
 * Fires the time-based triggers for every active tenant. Adding a new scheduled
 * automation means registering a handler and enabling a rule — this file does not
 * change.
 */

import prisma from '../../../config/prisma';
import { getWhatsAppConfig } from '../../../config/whatsapp.config';
import { logger } from '../../../utils/logger';
import { runTrigger } from './registry';
import type { AutomationTrigger } from '../types';

/** Triggers driven by the clock rather than by a business event. */
const SCHEDULED_TRIGGERS: AutomationTrigger[] = ['PaymentOverdue', 'EventApproaching'];

export type AutomationRunSummary = {
  tenants: number;
  rulesEvaluated: number;
  actionsQueued: number;
  skipped: number;
  skippedRun: boolean;
};

export async function runWhatsAppAutomationWorker(now?: Date): Promise<AutomationRunSummary> {
  const summary: AutomationRunSummary = {
    tenants: 0,
    rulesEvaluated: 0,
    actionsQueued: 0,
    skipped: 0,
    skippedRun: false,
  };

  const config = getWhatsAppConfig();
  if (!config.enabled || !config.features.automationEnabled) {
    summary.skippedRun = true;
    return summary;
  }

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  summary.tenants = tenants.length;

  for (const tenant of tenants) {
    for (const trigger of SCHEDULED_TRIGGERS) {
      try {
        const result = await runTrigger(trigger, { tenantId: tenant.id, now });
        summary.rulesEvaluated += result.rulesEvaluated;
        summary.actionsQueued += result.actionsQueued;
        summary.skipped += result.skipped;
      } catch (error) {
        // runTrigger already swallows per-rule failures; this guards the loop itself.
        logger.error('WhatsApp automation trigger threw', {
          trigger,
          tenantId: tenant.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  logger.info('WhatsApp automation worker tick complete', summary);
  return summary;
}
