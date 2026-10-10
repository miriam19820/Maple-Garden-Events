import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { whatsappService } from '../../services/whatsappService';
import { getAuthUser } from '../../services/api';
import { useWhatsAppPermissions } from '../../hooks/useWhatsAppPermissions';
import type {
  ConversationStatus,
  WhatsAppConversation,
  WhatsAppMessage,
} from '../../types/whatsapp';
import styles from './WhatsAppInbox.module.css';

const STATUS_LABELS: Record<ConversationStatus, string> = {
  Unassigned: 'לא משויך',
  Assigned: 'משויך',
  WaitingForCustomer: 'ממתין ללקוח',
  WaitingForManager: 'ממתין למנהל',
  Closed: 'סגור',
};

const MESSAGE_STATUS_LABELS: Record<string, string> = {
  Pending: 'בהמתנה',
  Processing: 'נשלח…',
  Sent: 'נשלח',
  Delivered: 'נמסר',
  Read: 'נקרא',
  Failed: 'נכשל',
  Cancelled: 'בוטל',
  Received: 'התקבל',
};

/** Meta only allows free-form replies within 24h of the customer's last message. */
function isWindowOpen(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000;
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WhatsAppInbox(): React.ReactElement {
  const [role, setRole] = useState<string | null>(null);
  const permissions = useWhatsAppPermissions(role);

  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | ''>('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAuthUser().then((user) => setRole(user?.role ?? null));
  }, []);

  const loadConversations = useCallback(async () => {
    setError(null);
    try {
      const result = await whatsappService.listConversations(
        statusFilter ? { status: statusFilter, limit: 100 } : { limit: 100 },
      );
      setConversations(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינת השיחות נכשלה.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!permissions.canView) return;
    void loadConversations();
  }, [permissions.canView, loadConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setError(null);
    try {
      const result = await whatsappService.listMessages(conversationId, { limit: 100 });
      // The API returns newest first; render oldest first.
      setMessages([...result.data].reverse());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינת ההודעות נכשלה.');
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId, loadMessages]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const windowOpen = selected ? isWindowOpen(selected.lastInboundAt) : false;

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || !draft.trim() || sending) return;

    setSending(true);
    setError(null);
    try {
      await whatsappService.replyInConversation(selectedId, draft.trim());
      setDraft('');
      await loadMessages(selectedId);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שליחת ההודעה נכשלה.');
    } finally {
      setSending(false);
    }
  };

  if (role !== null && !permissions.canView) {
    return <div className={styles.empty}>אין לך הרשאה לצפות בשיחות WhatsApp.</div>;
  }

  return (
    <div className={styles.wrapper} dir="rtl">
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.title}>שיחות WhatsApp</h2>
          <select
            className={styles.filter}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ConversationStatus | '')}
            aria-label="סינון לפי סטטוס"
          >
            <option value="">כל הסטטוסים</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {loading && <div className={styles.empty}>טוען…</div>}
        {!loading && conversations.length === 0 && (
          <div className={styles.empty}>אין שיחות להצגה.</div>
        )}

        <ul className={styles.list}>
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                className={`${styles.listItem} ${conversation.id === selectedId ? styles.listItemActive : ''}`}
                onClick={() => setSelectedId(conversation.id)}
              >
                <span className={styles.listName}>
                  {conversation.booking?.clientAFullName ?? conversation.phoneNumber}
                </span>
                <span className={styles.listMeta}>
                  {conversation.booking?.eventCode ? `${conversation.booking.eventCode} · ` : ''}
                  {STATUS_LABELS[conversation.status]}
                </span>
                <span className={styles.listTime}>{formatTime(conversation.lastMessageAt)}</span>
                {conversation.unreadCount > 0 && (
                  <span className={styles.badge}>{conversation.unreadCount}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={styles.thread}>
        {error && <div className={styles.error} role="alert">{error}</div>}

        {!selected && <div className={styles.empty}>בחר שיחה מהרשימה.</div>}

        {selected && (
          <>
            <header className={styles.threadHeader}>
              <div>
                <strong>{selected.booking?.clientAFullName ?? selected.phoneNumber}</strong>
                <div className={styles.threadSub}>
                  {selected.phoneNumber}
                  {selected.booking?.eventCode ? ` · ${selected.booking.eventCode}` : ''}
                </div>
              </div>
              <span className={styles.status}>{STATUS_LABELS[selected.status]}</span>
            </header>

            <div className={styles.messages}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`${styles.message} ${
                    message.direction === 'Outbound' ? styles.outbound : styles.inbound
                  }`}
                >
                  <div className={styles.messageBody}>
                    {message.content ?? (
                      <em>
                        [{message.messageType}
                        {message.templateName ? `: ${message.templateName}` : ''}]
                      </em>
                    )}
                  </div>
                  <div className={styles.messageMeta}>
                    {formatTime(message.createdAt)}
                    {message.direction === 'Outbound' && (
                      <> · {MESSAGE_STATUS_LABELS[message.status] ?? message.status}</>
                    )}
                    {message.errorCode && <> · שגיאה {message.errorCode}</>}
                  </div>
                </div>
              ))}
              {messages.length === 0 && <div className={styles.empty}>אין הודעות בשיחה זו.</div>}
            </div>

            {permissions.canSend && (
              <form className={styles.composer} onSubmit={handleSend}>
                {!windowOpen && (
                  <div className={styles.notice}>
                    חלון 24 השעות סגור — ניתן לשלוח רק תבנית מאושרת של Meta.
                  </div>
                )}
                <textarea
                  className={styles.input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="כתוב הודעה…"
                  rows={2}
                  disabled={!windowOpen || sending}
                />
                <button
                  type="submit"
                  className={styles.sendButton}
                  disabled={!windowOpen || sending || !draft.trim()}
                >
                  {sending ? 'שולח…' : 'שלח'}
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
