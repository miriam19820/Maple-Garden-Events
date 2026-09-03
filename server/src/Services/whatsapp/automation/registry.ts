/**
 * Trigger dispatch (§25).
 *
 * `runTrigger` is the only entry point. It loads the enabled rules for a trigger and
 * hands each to its registered handler. No business rule lives here.
 */

import prisma from '../../../config/prisma';
import { getWhatsAppConfig } from '../../../config/whatsapp.config';
import { logger } from '../../../utils/logger';
import { recordWhatsAppMetric } from '../metrics';
import type { AutomationTrigger } from '../types';
import { contractSignedHandler } from './handlers/contractSigned';
import { eventApproachingHandler } from './handlers/eventApproaching';
import { incomingMessageHandler } from './handlers/incomingMessage';
import { paymentOverdueHandler } from './handlers/paymentOverdue';
import { productionFormReadyHandler } from './handlers/productionFormReady';
import {
  emptyResult,
  mergeResults,
  type AutomationContextMap,
  type AutomationHandler,
  type AutomationResult,
  type AutomationRuleRow,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HANDLERS: { [K in AutomationTrigger]: AutomationHandler<K> } = {
  ContractSigned: contractSignedHandler,
  PaymentOverdue: paymentOverdueHandler,
  EventApproaching: eventApproachingHandler,
  IncomingMessage: incomingMessageHandler,
  ProductionFormReady: productionFormReadyHandler,
};

export function listAutomationHandlers(): { trigger: string; description: string }[] {
  return Object.values(HANDLERS).map((handler) => ({
    trigger: handler.trigger,
    description: handler.description,
  }));
}

async function loadEnabledRules(
  trigger: AutomationTrigger,
  tenantId?: string,
): Promise<AutomationRuleRow[]> {
  return (await prisma.whatsAppAutomationRule.findMany({
    where: { triggerType: trigger, isEnabled: true, ...(tenantId ? { tenantId } : {}) },
    orderBy: { createdAt: 'asc' },
  })) as unknown as AutomationRuleRow[];
}

/**
 * Fire a trigger.
 *
 * Never throws: an automation failure must not roll back the business operation that
 * caused it. Failures are logged and reported, and the tick moves on.
 */
export async function runTrigger<T extends AutomationTrigger>(
  trigger: T,
  context: AutomationContextMap[T],
): Promise<AutomationResult> {
  const config = getWhatsAppConfig();
  if (!config.enabled || !config.features.automationEnabled) {
    logger.debug('WhatsApp automation skipped (disabled by configuration)', { trigger });
    return emptyResult();
  }

  const tenantId = (context as { tenantId?: string }).tenantId;
  const rules = await loadEnabledRules(trigger, tenantId);

  if (rules.length === 0) {
    logger.debug('No enabled WhatsApp automation rules for trigger', { trigger, tenantId });
    return emptyResult();
  }

  const handler = HANDLERS[trigger];
  let total = emptyResult();

  for (const rule of rules) {
    try {
      const result = await handler.execute(rule, context);
      total = mergeResults(total, result);
      if (result.actionsQueued > 0) {
        recordWhatsAppMetric('whatsapp_automation_executed', result.actionsQueued);
      }
      await prisma.whatsAppAutomationRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date() },
      });
    } catch (error) {
      logger.error('WhatsApp automation rule failed', {
        trigger,
        ruleId: rule.id,
        tenantId: rule.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('WhatsApp automation trigger complete', { trigger, tenantId, ...total, details: undefined });
  return total;
}
