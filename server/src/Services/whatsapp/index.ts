/**
 * Public surface of the WhatsApp module.
 * Import from here rather than reaching into individual files.
 */

export * from './types';
export { WhatsAppError, classifyMetaError, isRetryableCode, WHATSAPP_ERROR_CODES } from './errors';
export type { WhatsAppErrorCode } from './errors';
export {
  PhoneNumberNormalizer,
  phoneNumberNormalizer,
  normalizePhone,
  phoneMatchSuffix,
  type IPhoneNumberNormalizer,
  type NormalizedPhone,
} from './phone';
export {
  getWhatsAppProvider,
  setWhatsAppProviderForTesting,
  resetWhatsAppProviderCache,
  FakeWhatsAppProvider,
  MetaWhatsAppProvider,
} from './providers';
export { queueWhatsAppMessage, type SendCommand, type SendOutcome } from './send.service';
export {
  enqueueOutboxMessage,
  claimDueMessages,
  releaseStaleClaims,
  markOutboxSent,
  markOutboxAttemptFailed,
  cancelOutboxMessage,
  computeBackoffMs,
  getOutboxStats,
  WORKER_ID,
} from './outbox.service';
export { runWhatsAppOutboxWorker, cleanupWhatsAppWebhookEvents } from './outboxWorker';
export {
  findBookingForPhone,
  getOrCreateConversation,
  assignConversation,
  setConversationStatus,
  markConversationRead,
  isWithinCustomerCareWindow,
} from './conversation.service';
export {
  recordInboundMessage,
  recordOutboundMessage,
  markMessageSent,
  markMessageFailed,
  applyStatusUpdate,
  mapProviderStatus,
} from './message.service';
export {
  parseWebhookEnvelope,
  persistWebhookEvent,
  claimWebhookEvent,
  claimPendingWebhookEvents,
  markWebhookEventProcessed,
  markWebhookEventFailed,
  type ParsedWebhookItem,
} from './webhookEvent.service';
export {
  processWebhookItem,
  resolveTenantForWebhook,
  runWhatsAppWebhookWorker,
} from './webhookProcessor';
export {
  assertTemplateSendable,
  buildTemplateComponents,
  listTemplates,
  upsertTemplate,
  syncTemplateMetaStatus,
  deleteTemplate,
  type TemplateParameterSpec,
} from './template.service';
export { runTrigger, listAutomationHandlers } from './automation/registry';
export { runWhatsAppAutomationWorker } from './automation/automationWorker';
export { getWhatsAppMetrics, resetWhatsAppMetrics, recordWhatsAppMetric } from './metrics';
export { getWhatsAppHealth } from './health';
