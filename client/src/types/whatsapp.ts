/**
 * WhatsApp API types — mirror of the server's response shapes.
 * Keep in sync with server/src/Services/whatsapp/types.ts.
 */

export type ConversationStatus =
  | 'Unassigned'
  | 'Assigned'
  | 'WaitingForCustomer'
  | 'WaitingForManager'
  | 'Closed';

export type MessageDirection = 'Inbound' | 'Outbound';

export type MessageStatus =
  | 'Pending'
  | 'Processing'
  | 'Sent'
  | 'Delivered'
  | 'Read'
  | 'Failed'
  | 'Cancelled'
  | 'Received';

export type TemplateMetaStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Disabled';

export type AutomationTrigger =
  | 'ContractSigned'
  | 'PaymentOverdue'
  | 'EventApproaching'
  | 'IncomingMessage'
  | 'ProductionFormReady';

export interface WhatsAppConversation {
  id: string;
  tenantId: string;
  bookingId: string | null;
  phoneNumber: string;
  status: ConversationStatus;
  assignedUserId: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
  createdAt: string;
  booking?: { id: string; eventCode: string; clientAFullName: string } | null;
  assignedUser?: { id: string; email: string } | null;
  _count?: { messages: number };
}

export interface WhatsAppMessage {
  id: string;
  direction: MessageDirection;
  messageType: string;
  content: string | null;
  templateName: string | null;
  status: MessageStatus;
  externalMessageId: string | null;
  errorCode: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

export interface WhatsAppTemplateParameter {
  position: number;
  key: string;
  description?: string;
  example?: string;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  /** Owned by Meta — the UI must never present a Draft template as sendable. */
  metaStatus: TemplateMetaStatus;
  parameters: WhatsAppTemplateParameter[] | null;
  bodyPreview: string | null;
  version: number;
  lastSyncedAt: string | null;
  updatedAt: string;
}

export interface WhatsAppAutomationRule {
  id: string;
  name: string;
  triggerType: AutomationTrigger;
  triggerConfiguration: Record<string, unknown> | null;
  templateId: string | null;
  actionType: string;
  actionConfiguration: Record<string, unknown> | null;
  isEnabled: boolean;
  lastRunAt: string | null;
  template?: Pick<WhatsAppTemplate, 'id' | 'name' | 'language' | 'metaStatus'> | null;
}

export interface WhatsAppSettings {
  status: 'ok' | 'degraded' | 'disabled';
  /** Booleans about whether each secret is present — never the secrets themselves. */
  config: Record<string, unknown>;
  outbox: Record<string, number>;
  metrics: Record<string, number>;
  issues: string[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
}

export interface ApiItemResponse<T> {
  success: boolean;
  data: T;
}
