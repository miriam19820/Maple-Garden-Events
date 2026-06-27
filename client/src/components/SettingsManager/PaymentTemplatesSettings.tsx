import React, { useState } from 'react';
import type { PaymentTermsTemplate } from '../../utils/paymentTerms';
import { DEFAULT_PAYMENT_TEMPLATES } from '../../utils/paymentTerms';

interface PaymentTemplatesSettingsProps {
  templates: PaymentTermsTemplate[];
  defaultTemplateId: string;
  onSave: (templates: PaymentTermsTemplate[], defaultTemplateId: string) => Promise<void>;
}

const emptyTemplate = (): PaymentTermsTemplate => ({
  id: `custom-${Date.now()}`,
  name: '',
  bodyTemplate:
    'תשלום עבור האירוע{{TOTAL_PART}} יבוצע כדלקמן: {{PERCENT_1}}%{{AMOUNT_1_PART}} לא יאוחר מ-7 ימים לפני האירוע{{DUE_1}}, ויתרת {{PERCENT_2}}%{{AMOUNT_2_PART}} לא יאוחר מ-24 שעות לאחר האירוע.',
  installments: [
    { percent: 50, dueType: 'WEEK_BEFORE_EVENT' },
    { percent: 50, dueType: 'HOURS_24_AFTER_EVENT' },
  ],
});

export const PaymentTemplatesSettings: React.FC<PaymentTemplatesSettingsProps> = ({
  templates: initialTemplates,
  defaultTemplateId: initialDefaultId,
  onSave,
}) => {
  const [templates, setTemplates] = useState<PaymentTermsTemplate[]>(
    initialTemplates.length ? initialTemplates : DEFAULT_PAYMENT_TEMPLATES,
  );
  const [defaultTemplateId, setDefaultTemplateId] = useState(initialDefaultId);
  const [draft, setDraft] = useState<PaymentTermsTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const startAdd = () => setDraft(emptyTemplate());

  const saveAll = async () => {
    setSaving(true);
    try {
      let next = templates;
      if (draft?.name.trim()) {
        next = [...templates.filter((t) => t.id !== draft.id), draft];
        setTemplates(next);
        setDraft(null);
      }
      await onSave(next, defaultTemplateId);
      alert('תבניות תשלום נשמרו בהצלחה');
    } catch {
      alert('שגיאה בשמירת תבניות');
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = (id: string) => {
    if (!window.confirm('להסיר תבנית זו?')) return;
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next.length ? next : DEFAULT_PAYMENT_TEMPLATES);
    if (defaultTemplateId === id) {
      setDefaultTemplateId(next[0]?.id || DEFAULT_PAYMENT_TEMPLATES[0].id);
    }
  };

  return (
    <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
      <h2>תבניות תשלום לחוזה</h2>
      <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
        התבניות יופיעו בטופס הזמנה. המנהל בוחר תבנית לכל אירוע ויכול לערוך נוסח ייחודי לחתונה ספציפית.
        השתמשי ב-placeholders: {'{{TOTAL_PART}}'}, {'{{PERCENT_1}}'}, {'{{AMOUNT_1_PART}}'}, {'{{DUE_1}}'}, {'{{PERCENT_2}}'}, {'{{AMOUNT_2_PART}}'}.
      </p>

      <div className="form-group">
        <label>ברירת מחדל בטופס הזמנה</label>
        <select
          value={defaultTemplateId}
          onChange={(e) => setDefaultTemplateId(e.target.value)}
          style={{ width: '100%', maxWidth: '420px', padding: '8px' }}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0' }}>
        {templates.map((t) => (
          <li
            key={t.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px',
              borderBottom: '1px solid #eee',
            }}
          >
            <div>
              <strong>{t.name}</strong>
              <div style={{ fontSize: '13px', color: '#555', marginTop: '6px', whiteSpace: 'pre-wrap' }}>
                {t.bodyTemplate}
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeTemplate(t.id)}
              style={{
                background: '#fee2e2',
                color: '#b91c1c',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              הסר
            </button>
          </li>
        ))}
      </ul>

      {draft && (
        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
          <div className="form-group">
            <label>שם תבנית</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="לדוגמה: 60/40 לחתונות קיץ"
            />
          </div>
          <div className="form-group">
            <label>נוסח לחוזה</label>
            <textarea
              rows={4}
              value={draft.bodyTemplate}
              onChange={(e) => setDraft({ ...draft, bodyTemplate: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="save-btn" onClick={() => {
              if (!draft.name.trim()) return alert('יש להזין שם');
              setTemplates((prev) => [...prev.filter((t) => t.id !== draft.id), draft]);
              setDraft(null);
            }}>
              הוסף לרשימה
            </button>
            <button type="button" onClick={() => setDraft(null)}>ביטול</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" className="add-btn" onClick={startAdd}>+ תבנית חדשה</button>
        <button type="button" className="save-btn" disabled={saving} onClick={saveAll}>
          {saving ? 'שומר...' : 'שמור תבניות תשלום'}
        </button>
      </div>
    </div>
  );
};

export default PaymentTemplatesSettings;
