import React, { useState } from 'react';
import styles from './OptionActionModal.module.css';

interface Props {
  option: any;
  onClose: () => void;
  onSuccess: () => void;
}

const OptionActionModal = ({ option, onClose, onSuccess }: Props) => {
  const [step, setStep] = useState<'choose' | 'finalize'>('choose');
  const [advancePaid, setAdvancePaid] = useState('');
  const [hasMusic, setHasMusic] = useState(true);
  const [akumCode, setAkumCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eventDateStr = option.eventDate?.date
    ? new Date(option.eventDate.date).toLocaleDateString('he-IL')
    : '';

  const handleCancel = async () => {
    if (!window.confirm('האם לבטל את האופציה? התאריך ישוחרר.')) return;
    try {
      const res = await fetch('http://localhost:5000/api/bookings/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateIds: [option.calendarDateId] }),
      });
      const result = await res.json();
      if (result.success) { alert('האופציה בוטלה והתאריך שוחרר.'); onSuccess(); }
      else alert(result.message);
    } catch { alert('שגיאת תקשורת עם השרת.'); }
  };

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('http://localhost:5000/api/bookings/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateId: option.calendarDateId,
          advancePaid,
          hasMusic,
          akumApprovalCode: akumCode,
        }),
      });
      const result = await res.json();
      if (result.success) { alert('האירוע נסגר בהצלחה! שאר האופציות שוחררו.'); onSuccess(); }
      else alert(result.message || 'שגיאה בסגירת האירוע');
    } catch { alert('שגיאת תקשורת עם השרת.'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <span>{step === 'choose' ? 'ניהול אופציה' : 'השלמת פרטי סגירה'} — {option.clientAFullName}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {step === 'choose' && (
          <div className={styles.body}>
            <div className={styles.infoBox}>
              <div className={styles.infoRow}><label>תאריך:</label><span>{eventDateStr}</span></div>
              <div className={styles.infoRow}><label>סוג אירוע:</label><span>{option.eventType}</span></div>
              <div className={styles.infoRow}><label>מועד:</label><span>{option.timeOfDay}</span></div>
              <div className={styles.infoRow}><label>מוזמנים:</label><span>{option.guestCount}</span></div>
              <div className={styles.infoRow}><label>מחיר מנה:</label><span>₪{option.finalPricePortion}</span></div>
              <div className={styles.infoRow}><label>סה"כ:</label><span style={{ fontWeight: 'bold' }}>₪{option.totalPrice?.toLocaleString()}</span></div>
              <div className={styles.infoRow}><label>טלפון:</label><span>{option.clientAPhone}</span></div>
              {option.eventDate?.optionExpiresAt && (
                <div className={styles.infoRow}>
                  <label>פג תוקף:</label>
                  <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                    {new Date(option.eventDate.optionExpiresAt).toLocaleString('he-IL')}
                  </span>
                </div>
              )}
            </div>

            <p className={styles.question}>מה תרצי לעשות?</p>

            <div className={styles.actionButtons}>
              <button className={styles.finalizeBtn} onClick={() => setStep('finalize')}>
                ✅ סגור אירוע על תאריך זה
              </button>
              <button className={styles.cancelOptionBtn} onClick={handleCancel}>
                🗑️ בטל אופציה ושחרר תאריך
              </button>
            </div>
          </div>
        )}

        {step === 'finalize' && (
          <form onSubmit={handleFinalize}>
            <div className={styles.body}>
              <div className={styles.infoBox}>
                <div className={styles.infoRow}><label>תאריך נבחר:</label><span style={{ fontWeight: 'bold' }}>{eventDateStr}</span></div>
                <div className={styles.infoRow}><label>לקוח:</label><span>{option.clientAFullName}</span></div>
                <div className={styles.infoRow}><label>סה"כ לתשלום:</label><span style={{ fontWeight: 'bold', color: '#1e293b' }}>₪{option.totalPrice?.toLocaleString()}</span></div>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>סכום מקדמה ששולם (₪) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  className={styles.input}
                  value={advancePaid}
                  onChange={e => setAdvancePaid(e.target.value)}
                  placeholder="לדוגמה: 5000"
                />
              </div>

              <div className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  id="musicCheck"
                  checked={hasMusic}
                  onChange={e => setHasMusic(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <label htmlFor="musicCheck" className={styles.inputLabel}>האירוע כולל מוזיקה (דורש רישוי אקו"ם)</label>
              </div>

              {hasMusic && (
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>קוד אישור אקו"ם</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={akumCode}
                    onChange={e => setAkumCode(e.target.value)}
                    placeholder="אם שולם באופן עצמאי"
                  />
                </div>
              )}
            </div>

            <div className={styles.footer}>
              <button type="button" className={styles.backBtn} onClick={() => setStep('choose')}>← חזור</button>
              <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                {isSubmitting ? 'סוגר אירוע...' : 'אשר וסגור אירוע 💳'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

export default OptionActionModal;
