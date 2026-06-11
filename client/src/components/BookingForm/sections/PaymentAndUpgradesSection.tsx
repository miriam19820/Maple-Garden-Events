import React from 'react';
import { KOSHER_PRICING } from '../BookingForm';

const PaymentAndUpgradesSection = ({ formData, handleChange, upgrades, handleUpgradeChange, isHallOnly, depositMethod, setDepositMethod, totals, isFoodRelevant, kosherType, isEditMode, editId, styles }: any) => {
  
  return (
    <>
      <div className={styles.sectionCard}>
        <h3 className={styles.sectionHeader}>חבילת תוספות ושדרוגים</h3>
        <div className={styles.upgradesGrid}>
          <label className={`${styles.upgradeLabel} ${isHallOnly ? styles.upgradeLabelDisabled : ''}`}>
            <input type="checkbox" checked={isHallOnly ? false : upgrades.baseDesign} readOnly disabled={isHallOnly} />
            <span>עיצוב בסיסי {isHallOnly ? '(לא רלוונטי)' : '(חובה) - 4,500 ₪'}</span>
          </label>
          <label className={styles.upgradeLabel}>
            <input type="checkbox" checked={upgrades.amplification} onChange={() => handleUpgradeChange('amplification')} />
            <span>הגברה - 1,400 ₪</span>
          </label>
          <label className={styles.upgradeLabel}>
            <input type="checkbox" checked={upgrades.lighting} onChange={() => handleUpgradeChange('lighting')} />
            <span>תאורה - 1,800 ₪</span>
          </label>
          <label className={styles.upgradeLabel}>
            <input type="checkbox" checked={upgrades.screens} onChange={() => handleUpgradeChange('screens')} />
            <span>מסכים - 800 ₪</span>
          </label>
          <label className={styles.upgradeLabel}>
            <input type="checkbox" checked={upgrades.reception} onChange={() => handleUpgradeChange('reception')} />
            <span>קבלת פנים - 2,000 ₪</span>
          </label>
          <label className={styles.upgradeLabel}>
            <input type="checkbox" checked={upgrades.separateReception} onChange={() => handleUpgradeChange('separateReception')} />
            <span>קבלת פנים נפרדת - 3,000 ₪</span>
          </label>
          <label className={styles.upgradeLabel}>
            <input type="checkbox" checked={upgrades.extraSecurity} onChange={() => handleUpgradeChange('extraSecurity')} />
            <span>מאבטח פיצול כניסה - 650 ₪</span>
          </label>
          <label className={styles.upgradeLabel}>
            <input type="checkbox" checked={upgrades.fireworks} onChange={() => handleUpgradeChange('fireworks')} />
            <span>זיקוקים - 700 ₪</span>
          </label>
        </div>
      </div>

      <div className={styles.sectionCard}>
        <h3 className={styles.sectionHeader}>סיכום, פיקדון ותשלום</h3>

        <div className={styles.paymentGrid}>
          <div className={styles.inputGroup}>
            <label>הנחה כוללת (%)</label>
            <input type="number" name="discountPercent" value={formData.discountPercent} onChange={handleChange} className={styles.input} placeholder="0" />
          </div>
          <div className={styles.inputGroup}>
            <label>הנחה בשקלים (₪)</label>
            <input type="number" name="discountAmount" value={formData.discountAmount} onChange={handleChange} className={styles.input} placeholder="0" />
          </div>
          <div className={`${styles.inputGroup} ${styles.vatRow}`}>
            <label>הגדרת מע"מ (18%)</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input type="radio" name="vatType" value="not_included" checked={formData.vatType === 'not_included'} onChange={handleChange} />
                לא כולל מע"מ
              </label>
              <label className={styles.radioLabel}>
                <input type="radio" name="vatType" value="included" checked={formData.vatType === 'included'} onChange={handleChange} />
                כולל מע"מ
              </label>
            </div>
          </div>
        </div>

        <div className={styles.depositOptions}>
          <label className={styles.radioLabel}>
            <input type="radio" name="deposit" value="credit_card" onChange={(e) => setDepositMethod(e.target.value)} />
            <span>תשלום באשראי / מזומן</span>
          </label>
          <label className={styles.radioLabel}>
            <input type="radio" name="deposit" value="check_upload" onChange={(e) => setDepositMethod(e.target.value)} />
            <span>העלאת צילום צ'ק פיקדון</span>
          </label>
          <label className={`${styles.radioLabel} ${styles.depositHighlight}`}>
            <input type="radio" name="deposit" value="check_capture" onChange={(e) => setDepositMethod(e.target.value)} />
            <span>📸 צילום צ'ק כעת</span>
          </label>
        </div>

        {depositMethod === 'check_upload' && (
          <div className={styles.fileUploadBox}>
            <input type="file" accept="image/*,.pdf" />
          </div>
        )}

        {depositMethod === 'check_capture' && (
          <div className={`${styles.fileUploadBox} ${styles.fileUploadBoxCapture}`}>
            <input type="file" accept="image/*" capture="environment" />
          </div>
        )}

        <div className={styles.inputGroup}>
          <label>תנאי תשלום והסדרים מול הלקוח</label>
          <textarea name="paymentTerms" value={formData.paymentTerms} onChange={handleChange} className={styles.input} rows={2} placeholder="פירוט תנאי התשלום שסוכמו..."></textarea>
        </div>
        
        {/* כפתור צפייה בחוזה לעריכה */}
        {isEditMode && formData.clientSignatureUrl && (
          <button 
            type="button"
            onClick={() => window.open(`http://localhost:5000/api/bookings/${editId}/contract-pdf`, '_blank')}
            className={styles.viewContractBtn}
            style={{ backgroundColor: '#059669', color: 'white', padding: '10px', borderRadius: '5px', border: 'none', cursor: 'pointer', marginTop: '15px' }}
          >
            📄 צפייה בחוזה החתום
          </button>
        )}

        <div className={styles.totalsBox}>
          <h4 className={styles.totalsTitle}>סה"כ הצעה / לתשלום</h4>
          <div className={styles.totalsBreakdown}>
            <span>סה"כ ביניים: ₪{totals.base.toLocaleString()}</span>
            {totals.discountVal > 0 && <span className={styles.discountLine}>הנחות: -₪{totals.discountVal.toLocaleString()}</span>}
            {totals.vatAmount > 0 && <span>תוספת מע"מ: ₪{totals.vatAmount.toLocaleString()}</span>}
          </div>
          <p className={styles.totalsFinal}>₪ {totals.finalTotal.toLocaleString()}</p>
          {isFoodRelevant && formData.guestCount && (
            <p className={styles.totalsNote}>
              כולל {formData.guestCount} מנות {formData.optionalGuestCount ? `+ ${formData.optionalGuestCount} רזרבה` : ''}, שדרוגים וכשרות {KOSHER_PRICING[kosherType].label}
            </p>
          )}
        </div>
      </div>
    </>
  );
};

export default PaymentAndUpgradesSection;