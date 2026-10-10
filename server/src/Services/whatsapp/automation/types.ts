/**
 * Automation engine contracts (§25).
 *
 * A trigger fires with a context; every ENABLED rule for that trigger is evaluated by
 * its handler, which decides whether the conditions hold and what to enqueue. Adding
 * a new automation means adding a handler + a rule row — never a new Worker.
 */

import type { AutomationTrigger } from '../types';

export type AutomationRuleRow = {
  id: string;
  tenantId: string;
  name: string;
  triggerType: string;
  triggerConfiguration: unknown;
  templateId: string | null;
  actionType: string;
  actionConfiguration: unknown;
  isEnabled: boolean;
  lastRunAt: Date | null;
};

/** Contexts, one per trigger. */
export type IncomingMessageContext = {
  tenantId: string;
  conversationId: string;
  /** Meta wamid of the inbound message — the stable key for dedupe. */
  externalMessageId: string;
  bookingId: string | null;
  fromPhone: string;
  text: string | null;
  messageType: string;
  profileName: string | null;
  isKnownCustomer: boolean;
};

export type ContractSignedContext = {
  tenantId: string;
  bookingId: string;
  /** Optional pre-rendered contract PDF, base64. */
  contractPdfBase64?: string;
  contractFilename?: string;
};

export type ProductionFormReadyContext = {
  tenantId: string;
  bookingId: string;
  documentBase64?: string;
  filename?: string;
  requestedBy?: string;
};

/** Scheduled triggers get no caller context — the handler scans for due work. */
export type ScheduledContext = {
  /** Restrict the scan to one tenant; omitted means all active tenants. */
  tenantId?: string;
  /** Evaluate as if "now" were this instant (tests). */
  now?: Date;
};

export type AutomationContextMap = {
  ContractSigned: ContractSignedContext;
  PaymentOverdue: ScheduledContext;
  EventApproaching: ScheduledContext;
  IncomingMessage: IncomingMessageContext;
  ProductionFormReady: ProductionFormReadyContext;
};

export type AutomationResult = {
  /** Rules considered for this trigger. */
  rulesEvaluated: number;
  /** Messages/notifications actually enqueued. */
  actionsQueued: number;
  /** Candidates skipped because conditions did not hold or data was missing. */
  skipped: number;
  details?: string[];
};

export interface AutomationHandler<T extends AutomationTrigger> {
  readonly trigger: T;
  /** Human description shown in the automations UI. */
  readonly description: string;
  /** Only called for enabled rules matching this trigger. */
  execute(rule: AutomationRuleRow, context: AutomationContextMap[T]): Promise<AutomationResult>;
}

export function emptyResult(): AutomationResult {
  return { rulesEvaluated: 0, actionsQueued: 0, skipped: 0, details: [] };
}

export function mergeResults(a: AutomationResult, b: AutomationResult): AutomationResult {
  return {
    rulesEvaluated: a.rulesEvaluated + b.rulesEvaluated,
    actionsQueued: a.actionsQueued + b.actionsQueued,
    skipped: a.skipped + b.skipped,
    details: [...(a.details ?? []), ...(b.details ?? [])],
  };
}
