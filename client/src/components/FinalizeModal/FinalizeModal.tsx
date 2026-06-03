import React, { useState } from 'react';
import styles from './FinalizeModal.module.css';

interface FinalizeModalProps {
  bookingId: string; // שונה מ-dateId
  clientName: string;
  onClose: () => void;
  onSuccess: () => void;
}
const FinalizeModal = ({ bookingId, clientName, onClose, onSuccess }: FinalizeModalProps) => {
  const [advancePaid, setAdvancePaid] = useState('');
  const [hasMusic, setHasMusic] = useState(true);
  const [akumCode, setAkumCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('http://localhost:5000/api/bookings/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        bookingId: bookingId,
          advancePaid: advancePaid,
          hasMusic: hasMusic,
          akumApprovalCode: akumCode
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('🎉 האירוע נסגר בהצלחה! כל שאר האופציות של הלקוח שוחררו.');
        onSuccess(); // סוגר את המודל ומרענן את המסך
      } else {
        alert(data.message || 'שגיאה בסגירת האירוע');
      }
    } catch (error) {
      alert('שגיאת תקשורת עם השרת');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>סגירה סופית - {clientName}</h3>
          <button className={styles.closeBtn} type="button" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            <div className={styles.inputGrid}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>סכום מקדמה ששולם (₪) *</label>
                <input 
                  type="number" 
                  required 
                  min="0"
                  className={styles.input} 
                  value={advancePaid} 
                  onChange={(e) => setAdvancePaid(e.target.value)} 
                  placeholder="לדוגמה: 5000"
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>קוד אישור אקו"ם</label>
                <input 
                  type="text" 
                  className={styles.input} 
                  value={akumCode} 
                  onChange={(e) => setAkumCode(e.target.value)} 
                  placeholder="אם שולם באופן עצמאי"
                  disabled={!hasMusic}
                />
              </div>
            </div>

            <div className={styles.checkboxGroup}>
              <input 
                type="checkbox" 
                id="musicCheck" 
                checked={hasMusic} 
                onChange={(e) => setHasMusic(e.target.checked)} 
                style={{ width: '18px', height: '18px' }}
              />
              <label htmlFor="musicCheck" className={styles.label}>האירוע כולל מוזיקה (דורש רישוי אקו"ם)</label>
            </div>

            <div className={styles.fileInputContainer}>
              <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#475569' }}>📸 העלאת צילום צ'ק ביטחון / חוזה חתום</p>
              <input type="file" accept="image/*,.pdf" />
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '5px 0 0 0' }}>
                (כרגע המערכת מכינה תשתית להעלאה, הקובץ יישמר בשרת בעדכון הבא)
              </p>
            </div>
          </div>

          <div className={styles.footer}>
            <button type="button" className={`${styles.btn} ${styles.cancelBtn}`} onClick={onClose}>ביטול</button>
            <button type="submit" className={`${styles.btn} ${styles.submitBtn}`} disabled={isSubmitting}>
              {isSubmitting ? 'סוגר אירוע...' : 'אשר תשלום וסגור אירוע 💳'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FinalizeModal;