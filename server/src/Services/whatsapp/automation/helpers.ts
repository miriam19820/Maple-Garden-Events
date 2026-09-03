/**
 * Shared helpers for automation handlers.
 *
 * Message TEXT lives in configuration (rule.actionConfiguration / templates), never
 * hard-coded in domain logic (§4). These helpers only fill placeholders.
 */

import prisma from '../../../config/prisma';
import { getWhatsAppConfig } from '../../../config/whatsapp.config';
import { logger } from '../../../utils/logger';
import { queueWhatsAppMessage, type SendCommand } from '../send.service';
import { buildTemplateComponents, type TemplateParameterSpec } from '../template.service';
import type { AutomationRuleRow } from './types';

/** `{{customerName}}` style substitution. Unknown keys become an em dash. */
export function renderTemplateText(text: string, values: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined || value === null || value === '' ? '—' : String(value);
  });
}

export function readConfig<T = Record<string, unknown>>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === 'object') return { ...fallback, ...(raw as T) };
  return fallback;
}

export function formatIlDate(date: Date | null | undefined): string {
  return date ? date.toLocaleDateString('he-IL') : '—';
}

export function formatIlAmount(amount: number | null | undefined): string {
  return typeof amount === 'number' ? `₪${amount.toLocaleString('he-IL')}` : '—';
}

/**
 * Turn a rule's action configuration into a concrete send command.
 *
 * A rule with a templateId sends that template (Meta-approved only). A rule with
 * `bodyTemplate` text sends free-form — valid only inside the 24h window, which
 * queueWhatsAppMessage enforces.
 */
export async function queueRuleAction(params: {
  rule: AutomationRuleRow;
  toPhone: string;
  values: Record<string, unknown>;
  bookingId?: string | null;
  dedupeKey: string;
}): Promise<boolean> {
  const config = getWhatsAppConfig();
  const action = readConfig<{ bodyTemplate?: string; language?: string }>(
    params.rule.actionConfiguration,
    {},
  );

  let command: SendCommand;

  if (params.rule.templateId) {
    const template = await prisma.whatsAppTemplate.findFirst({
      where: { id: params.rule.templateId, tenantId: params.rule.tenantId },
    });
    if (!template) {
      logger.warn('Automation rule references a missing template', {
        ruleId: params.rule.id,
        templateId: params.rule.templateId,
      });
      return false;
    }
    command = {
      kind: 'template',
      tenantId: params.rule.tenantId,
      toPhone: params.toPhone,
      bookingId: params.bookingId ?? null,
      dedupeKey: params.dedupeKey,
      requestedBy: `automation:${params.rule.name}`,
      templateName: template.name,
      languageCode: template.language,
      components: buildTemplateComponents(
        template.parameters as TemplateParameterSpec[] | null,
        params.values as Record<string, string>,
      ),
    };
  } else if (action.bodyTemplate) {
    command = {
      kind: 'text',
      tenantId: params.rule.tenantId,
      toPhone: params.toPhone,
      bookingId: params.bookingId ?? null,
      dedupeKey: params.dedupeKey,
      requestedBy: `automation:${params.rule.name}`,
      body: renderTemplateText(action.bodyTemplate, params.values),
    };
  } else {
    logger.warn('Automation rule has neither a template nor bodyTemplate — nothing to send', {
      ruleId: params.rule.id,
    });
    return false;
  }

  try {
    await queueWhatsAppMessage(command);
    return true;
  } catch (error) {
    // Business rejections (no template approval, outside 24h, bad number) are expected
    // here — log and skip rather than failing the whole automation tick.
    logger.warn('Automation could not queue a message', {
      ruleId: params.rule.id,
      tenantId: params.rule.tenantId,
      reason: error instanceof Error ? error.message : String(error),
      language: action.language ?? config.defaultLanguage,
    });
    return false;
  }
}

/** Manager destination for alert rules, from rule config first, then env. */
export function resolveManagerPhone(rule: AutomationRuleRow): string | null {
  const action = readConfig<{ managerPhone?: string }>(rule.actionConfiguration, {});
  return action.managerPhone ?? getWhatsAppConfig().managerPhone ?? null;
}
