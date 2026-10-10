import { apiFetch } from './api';
import { API_URL } from '../config/api';
import type {
  ApiItemResponse,
  ApiListResponse,
  ConversationStatus,
  WhatsAppAutomationRule,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppSettings,
  WhatsAppTemplate,
} from '../types/whatsapp';

const WHATSAPP_API = `${API_URL}/whatsapp`;

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok || body?.success === false) {
    // The server never leaks provider internals in `message` — safe to surface.
    throw new Error(body?.message || `Request failed (${res.status})`);
  }
  return body as T;
}

export const whatsappService = {
  listConversations: async (params: {
    status?: ConversationStatus;
    assignedUserId?: string;
    phone?: string;
    page?: number;
    limit?: number;
  } = {}) =>
    json<ApiListResponse<WhatsAppConversation>>(await apiFetch(`${WHATSAPP_API}/conversations${query(params)}`)),

  getConversation: async (id: string) =>
    json<ApiItemResponse<WhatsAppConversation>>(await apiFetch(`${WHATSAPP_API}/conversations/${id}`)),

  listMessages: async (conversationId: string, params: { page?: number; limit?: number } = {}) =>
    json<ApiListResponse<WhatsAppMessage>>(
      await apiFetch(`${WHATSAPP_API}/conversations/${conversationId}/messages${query(params)}`),
    ),

  assignConversation: async (id: string, assignedUserId: string | null) =>
    json<{ success: true }>(
      await apiFetch(`${WHATSAPP_API}/conversations/${id}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUserId }),
      }),
    ),

  setConversationStatus: async (id: string, status: ConversationStatus) =>
    json<{ success: true }>(
      await apiFetch(`${WHATSAPP_API}/conversations/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    ),

  /** Reply inside an existing thread. Server enforces Meta's 24h free-form window. */
  replyInConversation: async (id: string, body: string) =>
    json<ApiItemResponse<{ outboxId: string; messageId: string | null }>>(
      await apiFetch(`${WHATSAPP_API}/conversations/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }),
    ),

  /**
   * Start a new conversation. This is the call behind every "Send via WhatsApp"
   * button in the app (customer, event, contract, production form).
   */
  sendMessage: async (
    payload:
      | { kind: 'text'; toPhone: string; bookingId?: string; body: string }
      | {
          kind: 'template';
          toPhone: string;
          bookingId?: string;
          templateName: string;
          languageCode?: string;
          parameters?: Record<string, string | number>;
        }
      | {
          kind: 'document';
          toPhone: string;
          bookingId?: string;
          filename: string;
          link?: string;
          mediaId?: string;
          caption?: string;
        },
  ) =>
    json<ApiItemResponse<{ outboxId: string; messageId: string | null; conversationId: string }>>(
      await apiFetch(`${WHATSAPP_API}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ),

  listTemplates: async () =>
    json<{ success: boolean; data: WhatsAppTemplate[] }>(await apiFetch(`${WHATSAPP_API}/templates`)),

  saveTemplate: async (payload: {
    name: string;
    language: string;
    category?: string;
    bodyPreview?: string | null;
    parameters?: WhatsAppTemplate['parameters'];
  }) =>
    json<ApiItemResponse<WhatsAppTemplate>>(
      await apiFetch(`${WHATSAPP_API}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ),

  deleteTemplate: async (id: string) =>
    json<{ success: true }>(await apiFetch(`${WHATSAPP_API}/templates/${id}`, { method: 'DELETE' })),

  listAutomations: async () =>
    json<{
      success: boolean;
      data: { rules: WhatsAppAutomationRule[]; availableTriggers: { trigger: string; description: string }[] };
    }>(await apiFetch(`${WHATSAPP_API}/automations`)),

  createAutomation: async (payload: Partial<WhatsAppAutomationRule> & { name: string; triggerType: string }) =>
    json<ApiItemResponse<WhatsAppAutomationRule>>(
      await apiFetch(`${WHATSAPP_API}/automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ),

  updateAutomation: async (id: string, payload: Partial<WhatsAppAutomationRule>) =>
    json<ApiItemResponse<WhatsAppAutomationRule>>(
      await apiFetch(`${WHATSAPP_API}/automations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ),

  deleteAutomation: async (id: string) =>
    json<{ success: true }>(await apiFetch(`${WHATSAPP_API}/automations/${id}`, { method: 'DELETE' })),

  getSettings: async () =>
    json<ApiItemResponse<WhatsAppSettings>>(await apiFetch(`${WHATSAPP_API}/settings`)),
};
