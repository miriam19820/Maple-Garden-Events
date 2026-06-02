import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './BookingForm.module.css';

const KOSHER_PRICING: Record<string, { label: string, extra: number }> = {
  machpud: { label: 'מחפוד', extra: 0 },
  rubin: { label: 'רובין', extra: 10 },
  kehilot: { label: 'קהילות', extra: 10 },
  gross: { label: 'הרב גרוס', extra: 10 },
  landa: { label: 'לנדא', extra: 20 },
  badatz: { label: 'בד"ץ העדה החרדית', extra: 20 },
};

// רשימת הנציגים לבחירה
const representatives = ['מוישי', 'ציפי', 'שימי'];
const UPGRADES_PRICING: Record<string, number> = {
  baseDesign: 4500,
  amplification: 1400,
  lighting: 1800,
  screens: 800,
  reception: 2000,
  separateReception: 3000,
  extraSecurity: 650,
  fireworks: 700,
};

const BookingForm = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // יצירת מספר הזמנה אקראי וייחודי
const [orderNumber] = useState(() => Math.floor(10000 + Math.random() * 90000).toString());

  let initialDates: any[] = [];
  if (location.state?.selectedDates) {
    initialDates = location.state.selectedDates;
  } else if (location.state?.selectedDate) {
    initialDates = [location.state.selectedDate];
  } else if (location.state?.date) {
    initialDates = [{ date: location.state.date, hebrewDate: location.state.hebrewDate || '' }];
  }

  const [selectedDatesDisplay, setSelectedDatesDisplay] = useState<any[]>(initialDates);

  // פונקציה למציאת היום בשבוע מתוך התאריך
  const getDayOfWeek = (dateString: string) => {
    if (!dateString) return '';
    const days = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'שבת'];
    const date = new Date(dateString);
    return `יום ${days[date.getDay()]}`;
  };

  // בניית התצוגה של התאריך העברי יחד עם היום בשבוע
  const dateStr = selectedDatesDisplay.length > 0 && typeof selectedDatesDisplay[0] === 'object' ? selectedDatesDisplay[0].date : '';
  const dayOfWeek = getDayOfWeek(dateStr);
  const hebrewDateStr = selectedDatesDisplay.length > 0 && typeof selectedDatesDisplay[0] === 'object' ? selectedDatesDisplay[0].hebrewDate : '';
  const hebrewDateDisplay = hebrewDateStr ? `${hebrewDateStr}, ${dayOfWeek}` : '';

  const [formData, setFormData] = useState({
    createdBy: '', 
    clientAFullName: '', clientAIdNumber: '', clientAPhone: '', clientAPhone2: '', clientAEmail: '', clientACity: '', clientAAddress: '',
    clientBFullName: '', clientBIdNumber: '', clientBPhone: '', clientBPhone2: '', clientBEmail: '', clientBCity: '', clientBAddress: '',
    calendarDateId: '', eventType: '', 
    startTime: '', endTime: '', // שעות מדוייקות במקום בוקר/ערב
    guestCount: '', optionalGuestCount: '', // מנות אופציה הוספו, מינימום מנות הושמט
    finalPricePortion: '200', 
    discountPercent: '', discountAmount: '', // שדות הנחה
    vatType: 'not_included', // ברירת מחדל כמו במערכת הישנה
    paymentTerms: '', // תנאי תשלום חופשיים
    managerComments: '', clientComments: '',
  });
useEffect(() => {
    if (formData.eventType === 'חתונה') {
      setFormData(prev => ({ 
        ...prev, 
        startTime: '18:00', 
        endTime: '00:00' 
      }));
    }
  }, [formData.eventType]);
  const [servingStyle, setServingStyle] = useState('american');
  const [kosherType, setKosherType] = useState('machpud');
  const [upgrades, setUpgrades] = useState({
    baseDesign: true,
    amplification: false,
    lighting: false,
    screens: false,
    reception: false,
    separateReception: false,
    extraSecurity: false,
    fireworks: false,
  });
  const [depositMethod, setDepositMethod] = useState('');
  const [contractSigned, setContractSigned] = useState(false);

  const [isOption, setIsOption] = useState(location.state?.isOption || initialDates.length > 1);
  const [optionDurationHours, setOptionDurationHours] = useState(48);

  useEffect(() => {
    if (selectedDatesDisplay.length > 0) {
      const firstDate = typeof selectedDatesDisplay[0] === 'object' ? selectedDatesDisplay[0].date : selectedDatesDisplay[0];
      setFormData(prev => ({ ...prev, calendarDateId: firstDate || '' }));
    }
  }, [selectedDatesDisplay]);

  const [activeEmailField, setActiveEmailField] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailSuffixes = ['@gmail.com', '@hotmail.com', '@outlook.com', '@yahoo.com', '@icloud.com', '@walla.co.il'];

  const currentDateDisplay = new Date().toLocaleString('he-IL', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    // טיפול ב-radio buttons
    if (type === 'radio' && name === 'vatType') {
      setFormData(prev => ({ ...prev, vatType: value }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleUpgradeChange = (key: keyof typeof upgrades) => {
    if (key === 'baseDesign') return;
    setUpgrades((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleEmailSelect = (fieldName: string, suffix: string) => {
    const currentValue = formData[fieldName as keyof typeof formData] as string;
    const baseEmail = currentValue.split('@')[0];
    setFormData(prev => ({ ...prev, [fieldName]: baseEmail + suffix }));
    setActiveEmailField(null);
  };

  const isHallOnly = servingStyle === 'hall_only';
  const isFoodRelevant = !isHallOnly;
  
  // חישוב מורכב הכולל הנחות ומע"מ
  const calculateTotals = () => {
    let base = 0;
    
    // שדרוגים (ביטול עיצוב אם רק אולם)
    Object.keys(upgrades).forEach((key) => {
      if (key === 'baseDesign' && isHallOnly) return; 
      if (upgrades[key as keyof typeof upgrades]) {
        base += UPGRADES_PRICING[key];
      }
    });

    // אוכל
    if (isFoodRelevant) {
      const portions = Number(formData.guestCount) || 0;
      const basePrice = Number(formData.finalPricePortion) || 0;
      const kosherExtra = KOSHER_PRICING[kosherType].extra;
      base += portions * (basePrice + kosherExtra);
    }

    // חישובי הנחה
    let discountVal = 0;
    if (formData.discountPercent) {
      discountVal += base * (Number(formData.discountPercent) / 100);
    }
    if (formData.discountAmount) {
      discountVal += Number(formData.discountAmount);
    }

    let subtotal = base - discountVal;
    if (subtotal < 0) subtotal = 0;

    // מע"מ
    let vatAmount = 0;
    let finalTotal = subtotal;
    
    if (formData.vatType === 'not_included') {
      vatAmount = subtotal * 0.18; // מע"מ 18%
      finalTotal = subtotal + vatAmount;
    }

    return { base, discountVal, subtotal, vatAmount, finalTotal };
  };

  const totals = calculateTotals();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractSigned) {
      alert('חובה לסמן את אישור קריאת החוזה וחתימה עליו לפני סגירת האירוע.');
      return;
    }
    
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        orderNumber,
        createdAt: new Date().toISOString(), 
        allSelectedDates: selectedDatesDisplay,
        isOption: isOption,
        optionDurationHours: optionDurationHours,
        servingStyle,
        kosherType,
        upgrades,
        depositMethod,
        contractSigned,
        calculatedTotals: totals
      };
     
      const response = await fetch('http://localhost:5000/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();

      if (response.ok) {
        alert('האירוע נשמר בהצלחה במסד הנתונים!');
        navigate('/');
      } else {
        alert(`שגיאה בשמירת הנתונים: ${resData.message || 'השרת החזיר שגיאה לא ידועה'}`);
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("שגיאת התחברות לשרת - ודאי שהשרת פועל ברקע");
      setIsSubmitting(false);
    }
  };

  const isWedding = formData.eventType === 'חתונה';
  const eventTypesList = ['חתונה', 'אירוסין', 'בר מצווה', 'בת מצווה', 'ברית', 'בריתה', 'חינה', 'הרמת כוסית', 'כנס מקצועי', 'אירוע חברה/עסקי'];

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <button onClick={() => navigate('/')} style={{ background: '#e2e8f0', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold' }}>← חזרה ללוח</button>
            <h2 className={styles.title}>יצירת אירוע חדש <span className={styles.titleAccent}>| מייפל</span></h2>
          </div>
        </div>

        <form className={styles.formBody} onSubmit={handleSubmit} style={{ direction: 'rtl' }}>
          
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <div className={styles.inputGroup} style={{ flex: 1, minWidth: '150px', margin: 0 }}>
              <label style={{ fontWeight: 'bold', color: '#334155' }}>מספר הזמנה</label>
              <input type="text" value={orderNumber} readOnly className={styles.input} style={{ backgroundColor: '#e2e8f0', cursor: 'not-allowed', color: '#0f172a', fontWeight: 'bold' }} />
            </div>
           

            <div className={styles.inputGroup} style={{ flex: 2, minWidth: '200px', margin: 0 }}>
  <label style={{ fontWeight: 'bold', color: '#334155' }}>שם הנציג המטפל *</label>
  <select 
    name="createdBy" 
    required 
    value={formData.createdBy} 
    onChange={handleChange} 
    className={styles.input}
  >
    <option value="">בחרי נציג מהרשימה</option>
    {representatives.map(name => (
      <option key={name} value={name}>{name}</option>
    ))}
  </select>
</div>
            <div className={styles.inputGroup} style={{ flex: 1.5, minWidth: '180px', margin: 0 }}>
              <label style={{ fontWeight: 'bold', color: '#334155' }}>תאריך ושעת יצירה</label>
              <input type="text" value={currentDateDisplay} readOnly className={styles.input} style={{ backgroundColor: '#e2e8f0', cursor: 'not-allowed', color: '#475569', direction: 'ltr', textAlign: 'right' }} />
            </div>
          </div>
          {/* פרטי בעלי השמחה */}
          <div className={isWedding ? styles.clientsSectionWedding : styles.clientsSectionSingle} style={{ marginTop: '30px' }}>
            <div className={styles.clientBlock}>
              <h3 className={styles.sectionTitlePrimary}>{isWedding ? "פרטי צד החתן" : "פרטי בעל השמחה"}</h3>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}><label>שם מלא </label><input type="text" name="clientAFullName" required onChange={handleChange} className={styles.input} /></div>
                <div className={styles.inputGroup}><label>ת.ז </label><input type="text" name="clientAIdNumber" required onChange={handleChange} className={styles.input} /></div>
              </div>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}><label>טלפון  </label><input type="tel" name="clientAPhone" required onChange={handleChange} className={styles.input} /></div>
                <div className={styles.inputGroup}><label>טלפון חלופי</label><input type="tel" name="clientAPhone2" onChange={handleChange} className={styles.input} /></div>
              </div>
              <div className={styles.inputGroup} style={{ position: 'relative' }}>
                <label>דוא"ל *</label>
                <input type="text" name="clientAEmail" required value={formData.clientAEmail} onChange={(e) => { handleChange(e); setActiveEmailField('clientAEmail'); }} onBlur={() => setTimeout(() => setActiveEmailField(null), 200)} className={styles.input} autoComplete="off" />
                {activeEmailField === 'clientAEmail' && formData.clientAEmail.includes('@') && (
                  <ul className={styles.emailSuggestions}>
                    {emailSuffixes.map(s => <li key={s} onClick={() => handleEmailSelect('clientAEmail', s)} style={{ cursor: 'pointer', padding: '5px', background: '#fff', border: '1px solid #ddd' }}>{formData.clientAEmail.split('@')[0]}{s}</li>)}
                  </ul>
                )}
              </div>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}><label>עיר </label><input type="text" name="clientACity" required onChange={handleChange} className={styles.input} /></div>
                <div className={styles.inputGroup}><label>כתובת </label><input type="text" name="clientAAddress" required onChange={handleChange} className={styles.input} /></div>
              </div>
            </div>

            {isWedding && (
              <div className={styles.clientBlock}>
                <h3 className={styles.sectionTitleSecondary}>פרטי צד הכלה</h3>
                <div className={styles.inputRow}>
                  <div className={styles.inputGroup}><label>שם מלא </label><input type="text" name="clientBFullName" required={isWedding} onChange={handleChange} className={styles.input} /></div>
                  <div className={styles.inputGroup}><label>ת.ז </label><input type="text" name="clientBIdNumber" required={isWedding} onChange={handleChange} className={styles.input} /></div>
                </div>
                <div className={styles.inputRow}>
                  <div className={styles.inputGroup}><label>טלפון  </label><input type="tel" name="clientBPhone" required={isWedding} onChange={handleChange} className={styles.input} /></div>
                  <div className={styles.inputGroup}><label>טלפון חלופי</label><input type="tel" name="clientBPhone2" onChange={handleChange} className={styles.input} /></div>
                </div>
                <div className={styles.inputGroup} style={{ position: 'relative' }}>
                  <label>דוא"ל </label>
                  <input type="text" name="clientBEmail" required={isWedding} value={formData.clientBEmail} onChange={(e) => { handleChange(e); setActiveEmailField('clientBEmail'); }} onBlur={() => setTimeout(() => setActiveEmailField(null), 200)} className={styles.input} autoComplete="off" />
                  {activeEmailField === 'clientBEmail' && formData.clientBEmail.includes('@') && (
                    <ul className={styles.emailSuggestions}>
                      {emailSuffixes.map(s => <li key={s} onClick={() => handleEmailSelect('clientBEmail', s)} style={{ cursor: 'pointer', padding: '5px', background: '#fff', border: '1px solid #ddd' }}>{formData.clientBEmail.split('@')[0]}{s}</li>)}
                    </ul>
                  )}
                </div>
                <div className={styles.inputRow}>
                  <div className={styles.inputGroup}><label>עיר </label><input type="text" name="clientBCity" required={isWedding} onChange={handleChange} className={styles.input} /></div>
                  <div className={styles.inputGroup}><label>כתובת </label><input type="text" name="clientBAddress" required={isWedding} onChange={handleChange} className={styles.input} /></div>
                </div>
              </div>
            )}
          </div>

          <h3 className={styles.sectionTitle}>הגדרות אירוע בסיסיות</h3>
          <div className={styles.eventDetailsGrid}>
            <div className={styles.inputGroup}>
              <label>סוג אירוע </label>
              <select name="eventType" required onChange={handleChange} className={styles.input}>
                <option value="">בחרי מסוגי האירועים</option>
                {eventTypesList.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            
            <div className={styles.inputGroup}>
              <label>תאריך אירוע (לועזי)</label>
              <input type="date" name="calendarDateId" value={formData.calendarDateId} readOnly className={styles.input} style={{ backgroundColor: '#f1f5f9' }} />
            </div>

            <div className={styles.inputGroup}>
              <label>תאריך אירוע (עברי)</label>
              <input type="text" value={hebrewDateDisplay} readOnly className={styles.input} style={{ backgroundColor: '#f1f5f9', color: '#1e40af', fontWeight: 'bold' }} placeholder="לא נבחר תאריך עברי" />
            </div>

            <div className={styles.inputGroup} style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label>משעה</label>
                <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className={styles.input} />
              </div>
              <div style={{ flex: 1 }}>
                <label>עד שעה</label>
                <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className={styles.input} />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label>שיטת הגשה</label>
              <select value={servingStyle} onChange={(e) => setServingStyle(e.target.value)} className={styles.input}>
                <option value="american">אמריקן סרביס (ברירת מחדל)</option>
                <option value="center">מרכז שולחן</option>
                <option value="bar">בר</option>
                <option value="hall_only">שכירות אולם בלי אוכל</option>
              </select>
            </div>

            {isFoodRelevant && (
              <>
                <div className={styles.inputGroup} style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label>מנות (בפועל)</label>
                    <input type="number" name="guestCount" required onChange={handleChange} className={styles.input} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>מנות אופציה</label>
                    <input type="number" name="optionalGuestCount" onChange={handleChange} className={styles.input} />
                  </div>
                </div>
                
                <div className={styles.inputGroup}>
                  <label>מחיר מנה בסיסי *</label>
                  <input type="number" name="finalPricePortion" value={formData.finalPricePortion} required onChange={handleChange} className={styles.input} />
                </div>

                <div className={styles.inputGroup}>
                  <label>סוג כשרות</label>
                  <select value={kosherType} onChange={(e) => setKosherType(e.target.value)} className={styles.input}>
                    {Object.keys(KOSHER_PRICING).map((key) => (
                      <option key={key} value={key}>
                        {KOSHER_PRICING[key].label} {KOSHER_PRICING[key].extra > 0 ? `(+${KOSHER_PRICING[key].extra} ש"ח)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.inputGroup}>
                  <label>תפריט מנות לאירוע</label>
                  <div 
                    onClick={() => window.open('/menu', '_blank')}
                    className={styles.input} 
                    style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      backgroundColor: '#fef3c7', color: '#d97706', cursor: 'pointer', 
                      fontWeight: 'bold', border: '1px solid #fde68a', transition: '0.2s'
                    }}
                  >
                    📄 פתיחה וצפייה בתפריט
                  </div>
                </div>
              </>
            )}
          </div>

          {/* שדרוגים ותוספות */}
          <div style={{ marginTop: '30px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
             <h3 className={styles.sectionTitle} style={{ marginTop: 0 }}>שדרוגים ותוספות לאירוע</h3>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: isHallOnly ? 0.4 : 0.7 }}>
                  <input type="checkbox" checked={isHallOnly ? false : upgrades.baseDesign} readOnly disabled={isHallOnly} />
                  <span>עיצוב בסיסי {isHallOnly ? '(לא רלוונטי לאולם)' : '(חובה) - 4,500 ש"ח'}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.amplification} onChange={() => handleUpgradeChange('amplification')} />
                  <span>הגברה - 1,400 ש"ח</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.lighting} onChange={() => handleUpgradeChange('lighting')} />
                  <span>תאורה - 1,800 ש"ח</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.screens} onChange={() => handleUpgradeChange('screens')} />
                  <span>מסכים - 800 ש"ח</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.reception} onChange={() => handleUpgradeChange('reception')} />
                  <span>קבלת פנים - 2,000 ש"ח</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.separateReception} onChange={() => handleUpgradeChange('separateReception')} />
                  <span>קבלת פנים נפרדת - 3,000 ש"ח</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.extraSecurity} onChange={() => handleUpgradeChange('extraSecurity')} />
                  <span>מאבטח פיצול כניסה - 650 ש"ח</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.fireworks} onChange={() => handleUpgradeChange('fireworks')} />
                  <span>זיקוקים - 700 ש"ח</span>
                </label>
             </div>
          </div>


         
          <div style={{ marginTop: '30px', background: '#fff', border: '1px solid #cbd5e1', padding: '20px', borderRadius: '8px' }}>
            <h3 className={styles.sectionTitle} style={{ marginTop: 0 }}>פיקדון, חוזה ותשלום</h3>
            
            {/* שדות הנחה ומע"מ חדשים */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px', background: '#f1f5f9', padding: '15px', borderRadius: '8px' }}>
              <div className={styles.inputGroup} style={{ margin: 0 }}>
                <label>הנחה (%)</label>
                <input type="number" name="discountPercent" value={formData.discountPercent} onChange={handleChange} className={styles.input} placeholder="0" />
              </div>
              <div className={styles.inputGroup} style={{ margin: 0 }}>
                <label>הנחה (ש"ח)</label>
                <input type="number" name="discountAmount" value={formData.discountAmount} onChange={handleChange} className={styles.input} placeholder="0" />
              </div>
              <div className={styles.inputGroup} style={{ gridColumn: '1 / -1', margin: 0 }}>
                <label>מע"מ (18%)</label>
                <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                     <input type="radio" name="vatType" value="not_included" checked={formData.vatType === 'not_included'} onChange={handleChange} />
                     לא כולל מע"מ (יתווסף בסוף)
                   </label>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                     <input type="radio" name="vatType" value="included" checked={formData.vatType === 'included'} onChange={handleChange} />
                     כולל מע"מ (כלול במחיר)
                   </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="radio" name="deposit" value="credit_card" onChange={(e) => setDepositMethod(e.target.value)} />
                <span>תשלום באשראי / מזומן</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="radio" name="deposit" value="check_upload" onChange={(e) => setDepositMethod(e.target.value)} />
                <span>העלאת קובץ צ'ק מקיים</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#047857', fontWeight: 'bold' }}>
                <input type="radio" name="deposit" value="check_capture" onChange={(e) => setDepositMethod(e.target.value)} />
                <span>📸 צילום צ'ק כעת (מצלמה)</span>
              </label>
            </div>
            
            {depositMethod === 'check_upload' && (
              <div style={{ marginBottom: '15px', padding: '10px', background: '#f1f5f9', border: '1px dashed #94a3b8', borderRadius: '4px' }}>
                <input type="file" accept="image/*,.pdf" />
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '5px' }}>* בחרי קובץ מהמחשב או הגלריה.</p>
              </div>
            )}

            {depositMethod === 'check_capture' && (
              <div style={{ marginBottom: '15px', padding: '10px', background: '#ecfdf5', border: '1px dashed #10b981', borderRadius: '4px' }}>
                <input type="file" accept="image/*" capture="environment" />
                <p style={{ fontSize: '0.8rem', color: '#047857', marginTop: '5px' }}>* יפתח את המצלמה של המכשיר לצילום מיידי.</p>
              </div>
            )}

            <div className={styles.inputGroup}>
              <label>תנאי תשלום (הערות והסדרים מול הלקוח)</label>
              <textarea name="paymentTerms" value={formData.paymentTerms} onChange={handleChange} className={styles.input} rows={2} placeholder="פירוט תנאי התשלום שסוכמו..."></textarea>
            </div>

            <div style={{ background: '#fef3c7', padding: '15px', borderRadius: '8px', border: '1px solid #fde68a', marginTop: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold' }}>
                <input 
                  type="checkbox" 
                  checked={contractSigned} 
                  onChange={(e) => setContractSigned(e.target.checked)} 
                  style={{ width: '20px', height: '20px' }}
                />
                קראתי את החוזה, אני מאשר את התנאים וחותם (הפקת חוזה דיגיטלי ללקוח)
              </label>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'center', background: '#eff6ff', padding: '15px', borderRadius: '8px' }}>
               <h4 style={{ margin: 0, color: '#1e3a8a', fontSize: '1.2rem' }}>סיכום לתשלום</h4>
               
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', color: '#475569', marginTop: '10px', borderBottom: '1px solid #bfdbfe', paddingBottom: '10px' }}>
                 <span>סה"כ ביניים: ₪{totals.base.toLocaleString()}</span>
                 {totals.discountVal > 0 && <span style={{ color: '#dc2626' }}>הנחות: -₪{totals.discountVal.toLocaleString()}</span>}
                 {totals.vatAmount > 0 && <span>תוספת מע"מ (18%): ₪{totals.vatAmount.toLocaleString()}</span>}
               </div>

               <p style={{ margin: '10px 0 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#1d4ed8' }}>
                 ₪ {totals.finalTotal.toLocaleString()}
               </p>
               {isFoodRelevant && formData.guestCount && (
                 <p style={{ fontSize: '0.9rem', color: '#475569' }}>
                   (כולל {formData.guestCount} מנות {formData.optionalGuestCount ? `+ ${formData.optionalGuestCount} רזרבה` : ''}, שדרוגים וכשרות {KOSHER_PRICING[kosherType].label})
                 </p>
               )}
            </div>
          </div>
<div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
          <h3 className={styles.sectionTitle}>הערות מיוחדות</h3>
        
          <div className={styles.inputGroup}>
            <label>הערות </label>
            <textarea name="clientComments" value={formData.clientComments} onChange={handleChange} className={styles.input} rows={2} />
          </div>
        </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting || !contractSigned} style={{ opacity: (!contractSigned) ? 0.5 : 1 }}>
              {isSubmitting ? 'שומר נתונים, אנא המתן...' : 'שמירת אירוע'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default BookingForm;