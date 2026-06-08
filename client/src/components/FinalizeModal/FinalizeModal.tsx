import React, { useState } from 'react';
import styles from './FinalizeModal.module.css';
import { FloorPlanBuilder, type TableData } from '../FloorPlanBuilder/FloorPlanBuilder';
interface FinalizeModalProps {
  bookingId: string;
  clientName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const FinalizeModal = ({ bookingId, clientName, onClose, onSuccess }: FinalizeModalProps) => {
  const [advancePaid, setAdvancePaid] = useState('');
  const [hasMusic, setHasMusic] = useState(true);
  const [akumCode, setAkumCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State עבור השולחנות ועבור הצגת המפה
  const [tables, setTables] = useState<TableData[]>([]);
  const [showFloorPlan, setShowFloorPlan] = useState(false);

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
          akumApprovalCode: akumCode,
          tables: tables // העברת סידור השולחנות לשרת
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('🎉 האירוע נסגר בהצלחה! סידור האולם נשמר.');
        onSuccess();
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
            
            {/* כפתור פתיחת מפת השולחנות */}
            <div style={{ marginBottom: '20px' }}>
              <button 
                type="button" 
                className={styles.btn}
                style={{ backgroundColor: '#475569', width: '100%' }}
                onClick={() => setShowFloorPlan(!showFloorPlan)}
              >
                {showFloorPlan ? 'סגור סידור שולחנות' : '🛋️ סדר שולחנות באולם'}
              </button>
            </div>

            {/* הצגת המפה בתנאי */}
            {showFloorPlan && (
              <div style={{ marginBottom: '20px', padding: '10px', background: '#f4f4f4', borderRadius: '8px' }}>
                <FloorPlanBuilder 
                  tableCount={20} 
                  menPercent={50} 
                  womenPercent={50} 
                  onSave={(newTables) => {
                    setTables(newTables);
                    setShowFloorPlan(false); // סגירה אוטומטית אחרי שמירה
                  }}
                />
              </div>
            )}

            <div className={styles.inputGrid}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>סכום מקדמה ששולם (₪) *</label>
                <input 
                  type="number" required min="0" className={styles.input} 
                  value={advancePaid} onChange={(e) => setAdvancePaid(e.target.value)} 
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>קוד אישור אקו"ם</label>
                <input 
                  type="text" className={styles.input} 
                  value={akumCode} onChange={(e) => setAkumCode(e.target.value)} 
                  disabled={!hasMusic}
                />
              </div>
            </div>

            <div className={styles.checkboxGroup}>
              <input 
                type="checkbox" id="musicCheck" checked={hasMusic} 
                onChange={(e) => setHasMusic(e.target.checked)} 
              />
              <label htmlFor="musicCheck" className={styles.label}>האירוע כולל מוזיקה</label>
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