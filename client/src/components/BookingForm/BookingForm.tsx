import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './BookingForm.module.css';

interface BookingFormProps {
  initialDates?: any[];
  isOption?: boolean;
}

const KOSHER_PRICING: Record<string, { label: string, extra: number }> = {
  machpud: { label: 'מחפוד', extra: 0 },
  rubin: { label: 'רובין', extra: 10 },
  kehilot: { label: 'קהילות', extra: 10 },
  gross: { label: 'הרב גרוס', extra: 10 },
  landa: { label: 'לנדא', extra: 20 },
  badatz: { label: 'בד"ץ העדה החרדית', extra: 20 },
};

const representatives = ['מוישי', 'ציפי', 'שימי', 'מנהל מערכת'];

const UPGRADES_PRICING: Record<string, number> = {
  baseDesign: 4500, amplification: 1400, lighting: 1800, screens: 800,
  reception: 2000, separateReception: 3000, extraSecurity: 650, fireworks: 700,
};

const HEBREW_NUMERALS: Record<number, string> = {
  1:'א',2:'ב',3:'ג',4:'ד',5:'ה',6:'ו',7:'ז',8:'ח',9:'ט',10:'י',
  11:'יא',12:'יב',13:'יג',14:'יד',15:'טו',16:'טז',17:'יז',18:'יח',19:'יט',20:'כ',
  21:'כא',22:'כב',23:'כג',24:'כד',25:'כה',26:'כו',27:'כז',28:'כח',29:'כט',30:'ל'
};

const getHebrewDateString = (dateObj: Date | null) => {
  if (!dateObj) return '';
  try {
    const formatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long' });
    const fullString = formatter.format(dateObj);
    const parts = formatter.formatToParts(dateObj);
    const dayPart = parts.find(p => p.type === 'day')?.value;
    if (dayPart) {
      const hebLetter = HEBREW_NUMERALS[parseInt(dayPart, 10)];
      if (hebLetter) return fullString.replace(dayPart, hebLetter);
    }
    return fullString;
  } catch (e) {
    return '';
  }
};

const BookingForm = ({ initialDates, isOption: forcedIsOption }: BookingFormProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- ולידציות ---
  const validateFullName = (name: string) => name.trim().split(/\s+/).length >= 2;
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email);
  const validatePhone = (phone: string) => /^0(5[0-9]|[2-9]\d)-?\d{7}$/.test(phone.replace(/[-\s]/g, '').replace(/^(\d{3})(\d{7})$/, '$1-$2'));
  const validateIsraeliId = (id: string) => {
    const clean = id.trim();
    if (!/^\d{9}$/.test(clean)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let val = Number(clean[i]) * ((i % 2) + 1);
      if (val > 9) val -= 9;
      sum += val;
    }
    return sum % 10 === 0;
  };

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = (name: string, value: string) => {
    let msg = '';
    if (name === 'clientAFullName' || name === 'clientBFullName') {
      if (value && !validateFullName(value)) msg = 'יש להזין שם פרטי ושם משפחה';
    }
    if (name === 'clientAIdNumber' || name === 'clientBIdNumber') {
      if (value && !validateIsraeliId(value)) msg = 'תעודת זהות לא תקינה (9 ספרות)';
    }
    if (name === 'clientAPhone' || name === 'clientBPhone') {
      if (value && !validatePhone(value)) msg = 'מספר טלפון לא תקין';
    }
    if (name === 'clientAEmail' || name === 'clientBEmail') {
      if (value && !validateEmail(value)) msg = 'כתובת מייל לא תקינה';
    }
    setErrors(prev => ({ ...prev, [name]: msg }));
  };

  // זיהוי תאריכים
  let datesToProcess: any[] = [];
  if (initialDates && initialDates.length > 0) datesToProcess = initialDates;
  else if (location.state?.selectedDates) datesToProcess = location.state.selectedDates;
  else if (location.state?.selectedDate) datesToProcess = [location.state.selectedDate];
  else if (location.state?.date) datesToProcess = [{ date: location.state.date, hebrewDate: location.state.hebrewDate || '' }];

  const [selectedDatesDisplay] = useState<any[]>(datesToProcess);
  
  // זיהוי סטטוס אופציה/הזמנה
  const isOptionMode = forcedIsOption || location.state?.isOption || datesToProcess.length > 1;
  const [isOption] = useState(isOptionMode);
  const [optionDurationHours, setOptionDurationHours] = useState(48);

  // יצירת מספר הזמנה ייחודי לחלוטין (מבוסס על הזמן הנוכחי במילישניות)
  const [baseUniqueId] = useState(() => Date.now().toString().slice(-6));
  const orderNumber = isOption ? `OPT-${baseUniqueId}` : `EVT-${baseUniqueId}`;

  const getDayOfWeek = (dateString: string) => {
    if (!dateString) return '';
    const days = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'שבת'];
    const date = new Date(dateString);
    return `יום ${days[date.getDay()]}`;
  };

  const dateStr = selectedDatesDisplay.map(d => typeof d === 'object' ? d.date : d).join(', ');
  const hebrewDateDisplay = selectedDatesDisplay.map(d => {
    if (typeof d === 'object' && d.hebrewDate) {
      return `${d.hebrewDate} (${getDayOfWeek(d.date)})`;
    } else if (typeof d === 'string') {
      const hebDate = getHebrewDateString(new Date(d));
      return `${hebDate} (${getDayOfWeek(d)})`;
    }
    return '';
  }).filter(Boolean).join(' | ');

  const [formData, setFormData] = useState({
    createdBy: '', 
    clientAFullName: '', clientAIdNumber: '', clientAPhone: '', clientAPhone2: '', clientAEmail: '', clientACity: '', clientAAddress: '',
    clientBFullName: '', clientBIdNumber: '', clientBPhone: '', clientBPhone2: '', clientBEmail: '', clientBCity: '', clientBAddress: '',
    calendarDateId: '', eventType: '', 
    timeOfDay: '', startTime: '', endTime: '', // תוספת timeOfDay!
    guestCount: '', optionalGuestCount: '', 
    finalPricePortion: '200', 
    discountPercent: '', discountAmount: '', 
    vatType: 'not_included', 
    paymentTerms: '', 
    clientComments: '', menuNotes: '', // תוספת menuNotes!
    leadSource: '',
  });

  useEffect(() => {
    if (formData.eventType === 'חתונה') {
      setFormData(prev => ({ ...prev, startTime: '18:00', endTime: '00:00', timeOfDay: 'evening' }));
    } else if (formData.eventType === 'ברית') {
      setFormData(prev => ({ ...prev, startTime: '09:00', endTime: '14:00', timeOfDay: 'morning' }));
    }
  }, [formData.eventType]);

  const [servingStyle, setServingStyle] = useState('american');
  const [kosherType, setKosherType] = useState('machpud');
  const [upgrades, setUpgrades] = useState({
    baseDesign: true, amplification: false, lighting: false, screens: false,
    reception: false, separateReception: false, extraSecurity: false, fireworks: false,
  });
  const [depositMethod, setDepositMethod] = useState('');
  const [contractSigned, setContractSigned] = useState(false);

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
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'radio' && name === 'vatType') {
      setFormData(prev => ({ ...prev, vatType: value }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
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
  
  const calculateTotals = () => {
    let base = 0;
    Object.keys(upgrades).forEach((key) => {
      if (key === 'baseDesign' && isHallOnly) return; 
      if (upgrades[key as keyof typeof upgrades]) {
        base += UPGRADES_PRICING[key];
      }
    });

    if (isFoodRelevant) {
      const portions = Number(formData.guestCount) || 0;
      const basePrice = Number(formData.finalPricePortion) || 0;
      const kosherExtra = KOSHER_PRICING[kosherType].extra;
      base += portions * (basePrice + kosherExtra);
    }

    let discountVal = 0;
    if (formData.discountPercent) discountVal += base * (Number(formData.discountPercent) / 100);
    if (formData.discountAmount) discountVal += Number(formData.discountAmount);

    let subtotal = base - discountVal;
    if (subtotal < 0) subtotal = 0;

    let vatAmount = 0;
    let finalTotal = subtotal;
    
    if (formData.vatType === 'not_included') {
      vatAmount = subtotal * 0.18; 
      finalTotal = subtotal + vatAmount;
    }
    return { base, discountVal, subtotal, vatAmount, finalTotal };
  };

  const totals = calculateTotals();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isOption && !contractSigned) {
      alert('חובה לסמן את אישור קריאת החוזה וחתימה עליו לפני סגירת האירוע.');
      return;
    }
    
    if (isSubmitting) return;

    const fieldsToCheck: [string, string][] = [
      ['clientAFullName', formData.clientAFullName],
      ['clientAPhone', formData.clientAPhone],
    ];
    const newErrors: Record<string, string> = {};
    for (const [name, value] of fieldsToCheck) {
      if (name.includes('FullName') && !validateFullName(value)) newErrors[name] = 'יש להזין שם פרטי ושם משפחה';
      if (name.includes('Phone') && !validatePhone(value)) newErrors[name] = 'מספר טלפון לא תקין';
    }
    if (Object.values(newErrors).some(err => err)) {
      setErrors(newErrors);
      alert('יש לתקן את השדות המסומנים באדום לפני המשך');
      return;
    }

    setIsSubmitting(true);

    try {
      // נשלב את הערות התפריט יחד עם הערות הלקוח הכלליות כדי שייכנס לשרת תחת שדה קיים
      const combinedComments = formData.menuNotes ? `${formData.clientComments}\n\n[הערות תפריט]: ${formData.menuNotes}` : formData.clientComments;

      const payload = {
        ...formData,
        clientComments: combinedComments,
        orderNumber, // שולחים את מספר ההזמנה המדויק לשרת
        createdAt: new Date().toISOString(), 
        allSelectedDates: selectedDatesDisplay,
        isOption: isOption,
        optionDurationHours: optionDurationHours,
        servingStyle, kosherType, upgrades, depositMethod, contractSigned,
        calculatedTotals: totals
      };
      
      const response = await fetch('http://localhost:5000/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();

      if (response.ok) {
        alert(isOption ? 'האופציה נשמרה בהצלחה! (ניתן לשלוח הצעת מחיר / חוזה מהמערכת)' : 'האירוע נסגר ונשמר בהצלחה!');
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
            <h2 className={styles.title}>
               {isOption ? 'שמירת אופציה לאירוע' : 'סגירת הזמנת אירוע'} <span className={styles.titleAccent}>| מייפל</span>
            </h2>
          </div>
        </div>

        <form className={styles.formBody} onSubmit={handleSubmit} style={{ direction: 'rtl' }}>
          
          {/* שורת הגדרות כלליות עליונה */}
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <div className={styles.inputGroup} style={{ flex: 1, minWidth: '150px', margin: 0 }}>
              <label style={{ fontWeight: 'bold', color: '#334155' }}>מספר {isOption ? 'אופציה' : 'הזמנה'}</label>
              <input type="text" value={orderNumber} readOnly className={styles.input} style={{ backgroundColor: '#e2e8f0', cursor: 'not-allowed', color: '#0f172a', fontWeight: 'bold' }} />
            </div>
            
            <div className={styles.inputGroup} style={{ flex: 1.5, minWidth: '180px', margin: 0 }}>
              <label style={{ fontWeight: 'bold', color: '#334155' }}>שם הנציג / סוכן *</label>
              <select name="createdBy" required value={formData.createdBy} onChange={handleChange} className={styles.input}>
                <option value="">בחרי נציג מהרשימה</option>
                {representatives.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>

            <div className={styles.inputGroup} style={{ flex: 1.5, minWidth: '180px', margin: 0 }}>
              <label style={{ fontWeight: 'bold', color: '#334155' }}>סוג אירוע *</label>
              <select name="eventType" required onChange={handleChange} className={styles.input}>
                <option value="">בחרי מסוגי האירועים</option>
                {eventTypesList.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>

            {isOption && (
              <div className={styles.inputGroup} style={{ flex: 1, minWidth: '150px', margin: 0 }}>
                <label style={{ fontWeight: 'bold', color: '#b45309' }}>תוקף אופציה (בשעות)</label>
                <input type="number" value={optionDurationHours} onChange={(e) => setOptionDurationHours(Number(e.target.value))} className={styles.input} style={{ borderColor: '#f59e0b' }} />
              </div>
            )}
            
            <div className={styles.inputGroup} style={{ flex: 1.5, minWidth: '180px', margin: 0 }}>
              <label style={{ fontWeight: 'bold', color: '#334155' }}>תאריך {isOption ? 'פתיחת האופציה' : 'סגירת האירוע'}</label>
              <input type="text" value={currentDateDisplay} readOnly className={styles.input} style={{ backgroundColor: '#e2e8f0', cursor: 'not-allowed', color: '#475569', direction: 'ltr', textAlign: 'right' }} />
            </div>
          </div>
          
          {/* פרטי בעלי השמחה */}
          <div className={isWedding ? styles.clientsSectionWedding : styles.clientsSectionSingle} style={{ marginTop: '30px' }}>
            <div className={styles.clientBlock}>
              <h3 className={styles.sectionTitlePrimary}>{isWedding ? "פרטי צד החתן" : "פרטי בעל השמחה / הלקוח"}</h3>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}>
                  <label>שם מלא </label>
                  <input type="text" name="clientAFullName" required onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientAFullName ? styles.inputError : ''}`} />
                  {errors.clientAFullName && <span className={styles.errorMsg}>{errors.clientAFullName}</span>}
                </div>
                <div className={styles.inputGroup}>
                  <label>תעודת זהות</label>
                  <input type="text" name="clientAIdNumber" onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientAIdNumber ? styles.inputError : ''}`} />
                  {errors.clientAIdNumber && <span className={styles.errorMsg}>{errors.clientAIdNumber}</span>}
                </div>
              </div>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}>
                  <label>מספר טלפון 1 *</label>
                  <input type="tel" name="clientAPhone" required onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientAPhone ? styles.inputError : ''}`} />
                  {errors.clientAPhone && <span className={styles.errorMsg}>{errors.clientAPhone}</span>}
                </div>
                <div className={styles.inputGroup}>
                  <label>מספר טלפון 2</label>
                  <input type="tel" name="clientAPhone2" onChange={handleChange} className={styles.input} />
                </div>
              </div>

              <div className={styles.inputGroup} style={{ position: 'relative' }}>
                <label>כתובת דוא"ל</label>
                <input 
                  type="text" 
                  name="clientAEmail" 
                  value={formData.clientAEmail} 
                  onChange={(e) => { handleChange(e); setActiveEmailField('clientAEmail'); }} 
                  onBlur={(e) => { setTimeout(() => setActiveEmailField(null), 300); setTimeout(() => validateField(e.target.name, e.target.value), 300); }} 
                  className={`${styles.input} ${errors.clientAEmail ? styles.inputError : ''}`} 
                  autoComplete="off" 
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
                {errors.clientAEmail && <span className={styles.errorMsg}>{errors.clientAEmail}</span>}
                {activeEmailField === 'clientAEmail' && formData.clientAEmail.includes('@') && (
                  <ul className={styles.emailSuggestions}>
                    {emailSuffixes.map(s => (
                      <li 
                        key={s} 
                        onClick={() => handleEmailSelect('clientAEmail', s)} 
                        dir="ltr"
                        style={{ cursor: 'pointer', padding: '5px', background: '#fff', border: '1px solid #ddd', textAlign: 'right' }}
                      >
                        {formData.clientAEmail.split('@')[0]}{s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}><label>עיר </label><input type="text" name="clientACity" onChange={handleChange} className={styles.input} /></div>
                <div className={styles.inputGroup}><label>כתובת (רחוב ומספר) </label><input type="text" name="clientAAddress" onChange={handleChange} className={styles.input} /></div>
              </div>
            </div>

            {isWedding && (
              <div className={styles.clientBlock}>
                <h3 className={styles.sectionTitleSecondary}>פרטי צד הכלה</h3>
                <div className={styles.inputRow}>
                  <div className={styles.inputGroup}>
                    <label>שם מלא </label>
                    <input type="text" name="clientBFullName" required={isWedding} onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientBFullName ? styles.inputError : ''}`} />
                    {errors.clientBFullName && <span className={styles.errorMsg}>{errors.clientBFullName}</span>}
                  </div>
                  <div className={styles.inputGroup}>
                    <label>תעודת זהות</label>
                    <input type="text" name="clientBIdNumber" onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientBIdNumber ? styles.inputError : ''}`} />
                    {errors.clientBIdNumber && <span className={styles.errorMsg}>{errors.clientBIdNumber}</span>}
                  </div>
                </div>
                <div className={styles.inputRow}>
                  <div className={styles.inputGroup}>
                    <label>מספר טלפון 1 *</label>
                    <input type="tel" name="clientBPhone" required={isWedding} onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientBPhone ? styles.inputError : ''}`} />
                    {errors.clientBPhone && <span className={styles.errorMsg}>{errors.clientBPhone}</span>}
                  </div>
                  <div className={styles.inputGroup}>
                    <label>מספר טלפון 2</label>
                    <input type="tel" name="clientBPhone2" onChange={handleChange} className={styles.input} />
                  </div>
                </div>
                <div className={styles.inputGroup} style={{ position: 'relative' }}>
                  <label>כתובת דוא"ל </label>
                  <input 
                    type="text" 
                    name="clientBEmail" 
                    value={formData.clientBEmail} 
                    onChange={(e) => { handleChange(e); setActiveEmailField('clientBEmail'); }} 
                    onBlur={(e) => { setTimeout(() => setActiveEmailField(null), 300); setTimeout(() => validateField(e.target.name, e.target.value), 300); }} 
                    className={`${styles.input} ${errors.clientBEmail ? styles.inputError : ''}`} 
                    autoComplete="off" 
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                  {errors.clientBEmail && <span className={styles.errorMsg}>{errors.clientBEmail}</span>}
                  {activeEmailField === 'clientBEmail' && formData.clientBEmail.includes('@') && (
                    <ul className={styles.emailSuggestions}>
                      {emailSuffixes.map(s => (
                        <li 
                          key={s} 
                          onClick={() => handleEmailSelect('clientBEmail', s)} 
                          dir="ltr"
                          style={{ cursor: 'pointer', padding: '5px', background: '#fff', border: '1px solid #ddd', textAlign: 'right' }}
                        >
                          {formData.clientBEmail.split('@')[0]}{s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={styles.inputRow}>
                  <div className={styles.inputGroup}><label>עיר </label><input type="text" name="clientBCity" onChange={handleChange} className={styles.input} /></div>
                  <div className={styles.inputGroup}><label>כתובת (רחוב ומספר) </label><input type="text" name="clientBAddress" onChange={handleChange} className={styles.input} /></div>
                </div>
              </div>
            )}
          </div>

          <h3 className={styles.sectionTitle}>הגדרות אירוע, זמנים ותפריט</h3>
          <div className={styles.eventDetailsGrid}>
            <div className={styles.inputGroup}>
              <label>דרך מי הגיעו? (מקור הגעה)</label>
              <input type="text" name="leadSource" value={formData.leadSource} onChange={handleChange} className={styles.input} placeholder="לדוגמה: פייסבוק, חבר שהמליץ..." />
            </div>
            
            <div className={styles.inputGroup}>
              <label>{isOption ? 'תאריכים אופציונליים (לועזי)' : 'תאריך אירוע סופי (לועזי)'}</label>
              <input type="text" name="calendarDateId" value={dateStr} readOnly className={styles.input} style={{ backgroundColor: '#f1f5f9' }} />
            </div>

            <div className={styles.inputGroup}>
              <label>{isOption ? 'תאריכים אופציונליים (עברי)' : 'תאריך אירוע סופי (עברי)'}</label>
              <input type="text" value={hebrewDateDisplay} readOnly className={styles.input} style={{ backgroundColor: '#f1f5f9', color: '#1e40af', fontWeight: 'bold' }} />
            </div>

            {/* --- הוספת זמן אירוע בוקר/צהריים/ערב --- */}
            <div className={styles.inputGroup}>
              <label>זמן ביום *</label>
              <select name="timeOfDay" required value={formData.timeOfDay} onChange={handleChange} className={styles.input}>
                <option value="">בחרי חלק ביום</option>
                <option value="morning">בוקר</option>
                <option value="noon">צהריים</option>
                <option value="evening">ערב</option>
              </select>
            </div>

            <div className={styles.inputGroup} style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label>משעה מדוייקת</label>
                <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className={styles.input} />
              </div>
              <div style={{ flex: 1 }}>
                <label>עד שעה מדוייקת</label>
                <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className={styles.input} />
              </div>
            </div>
            {/* הערת שעות נוספות לנציג */}
            <div style={{ gridColumn: '1 / -1', marginTop: '-10px', marginBottom: '10px', fontSize: '0.85rem', color: '#b91c1c' }}>
              * שים לב: לאחר סיום שעות האירוע המוגדרות תיתכן תוספת תשלום על כל שעה נוספת.
            </div>

            <div className={styles.inputGroup}>
              <label>צורת הגשה (תפריט)</label>
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
                    <label>כמות מנות (בפועל)</label>
                    <input type="number" name="guestCount" required onChange={handleChange} className={styles.input} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>מנות אופציה (רזרבה)</label>
                    <input type="number" name="optionalGuestCount" onChange={handleChange} className={styles.input} />
                  </div>
                </div>
                
                <div className={styles.inputGroup}>
                  <label>מחיר מנה בסיסי (₪) *</label>
                  <input type="number" name="finalPricePortion" value={formData.finalPricePortion} required onChange={handleChange} className={styles.input} />
                </div>

                <div className={styles.inputGroup}>
                  <label>סוג כשרות</label>
                  <select value={kosherType} onChange={(e) => setKosherType(e.target.value)} className={styles.input}>
                    {Object.keys(KOSHER_PRICING).map((key) => (
                      <option key={key} value={key}>
                        {KOSHER_PRICING[key].label} {KOSHER_PRICING[key].extra > 0 ? `(+${KOSHER_PRICING[key].extra} ש"ח למנה)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* --- צפייה בתפריט והערות לתפריט --- */}
                <div className={styles.inputGroup}>
                  <label>צפייה בתפריט הקיים</label>
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

          <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
             <h3 className={styles.sectionTitle} style={{ marginTop: 0 }}>הערות לתפריט ובקשות מיוחדות (נשמר במידה והאירוע נסגר)</h3>
             <textarea name="menuNotes" value={formData.menuNotes} onChange={handleChange} className={styles.input} rows={2} placeholder="לדוגמה: אלרגיות מיוחדות, בקשה להחלפת מנה מסוימת..." />
          </div>

          <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
             <h3 className={styles.sectionTitle} style={{ marginTop: 0 }}>חבילת תוספות ושדרוגים לאירוע</h3>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: isHallOnly ? 0.4 : 0.7 }}>
                  <input type="checkbox" checked={isHallOnly ? false : upgrades.baseDesign} readOnly disabled={isHallOnly} />
                  <span>עיצוב בסיסי {isHallOnly ? '(לא רלוונטי)' : '(חובה) - 4,500 ₪'}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.amplification} onChange={() => handleUpgradeChange('amplification')} />
                  <span>הגברה - 1,400 ₪</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.lighting} onChange={() => handleUpgradeChange('lighting')} />
                  <span>תאורה - 1,800 ₪</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.screens} onChange={() => handleUpgradeChange('screens')} />
                  <span>מסכים - 800 ₪</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.reception} onChange={() => handleUpgradeChange('reception')} />
                  <span>קבלת פנים - 2,000 ₪</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.separateReception} onChange={() => handleUpgradeChange('separateReception')} />
                  <span>קבלת פנים נפרדת - 3,000 ₪</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.extraSecurity} onChange={() => handleUpgradeChange('extraSecurity')} />
                  <span>מאבטח פיצול כניסה - 650 ₪</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={upgrades.fireworks} onChange={() => handleUpgradeChange('fireworks')} />
                  <span>זיקוקים - 700 ₪</span>
                </label>
             </div>
          </div>

          <div style={{ marginTop: '30px', background: '#fff', border: '1px solid #cbd5e1', padding: '20px', borderRadius: '8px' }}>
            <h3 className={styles.sectionTitle} style={{ marginTop: 0 }}>סיכום, פיקדון ותשלום</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px', background: '#f1f5f9', padding: '15px', borderRadius: '8px' }}>
              <div className={styles.inputGroup} style={{ margin: 0 }}>
                <label>הנחה כוללת (%)</label>
                <input type="number" name="discountPercent" value={formData.discountPercent} onChange={handleChange} className={styles.input} placeholder="0" />
              </div>
              <div className={styles.inputGroup} style={{ margin: 0 }}>
                <label>הנחה בשקלים (₪)</label>
                <input type="number" name="discountAmount" value={formData.discountAmount} onChange={handleChange} className={styles.input} placeholder="0" />
              </div>
              <div className={styles.inputGroup} style={{ gridColumn: '1 / -1', margin: 0 }}>
                <label>הגדרת מע"מ (18%)</label>
                <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                     <input type="radio" name="vatType" value="not_included" checked={formData.vatType === 'not_included'} onChange={handleChange} />
                     לא כולל מע"מ (תוספת בסוף)
                   </label>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                     <input type="radio" name="vatType" value="included" checked={formData.vatType === 'included'} onChange={handleChange} />
                     כולל מע"מ (המע"מ כלול במחיר המנה)
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
                <span>העלאת צילום צ'ק פיקדון</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#047857', fontWeight: 'bold' }}>
                <input type="radio" name="deposit" value="check_capture" onChange={(e) => setDepositMethod(e.target.value)} />
                <span>📸 צילום צ'ק כעת</span>
              </label>
            </div>
            
            {depositMethod === 'check_upload' && (
              <div style={{ marginBottom: '15px', padding: '10px', background: '#f1f5f9', border: '1px dashed #94a3b8', borderRadius: '4px' }}>
                <input type="file" accept="image/*,.pdf" />
              </div>
            )}

            {depositMethod === 'check_capture' && (
              <div style={{ marginBottom: '15px', padding: '10px', background: '#ecfdf5', border: '1px dashed #10b981', borderRadius: '4px' }}>
                <input type="file" accept="image/*" capture="environment" />
              </div>
            )}

            <div className={styles.inputGroup}>
              <label>תנאי תשלום והסדרים מול הלקוח</label>
              <textarea name="paymentTerms" value={formData.paymentTerms} onChange={handleChange} className={styles.input} rows={2} placeholder="פירוט תנאי התשלום שסוכמו..."></textarea>
            </div>

            <div style={{ background: '#fef3c7', padding: '15px', borderRadius: '8px', border: '1px solid #fde68a', marginTop: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={contractSigned} 
                  onChange={(e) => setContractSigned(e.target.checked)} 
                  style={{ width: '20px', height: '20px' }}
                />
                קראתי את החוזה, אני מאשר את התנאים וחותם {isOption && <span style={{ color: '#b45309', fontWeight: 'normal' }}>- לא חובה בשמירת אופציה</span>}
              </label>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'center', background: '#eff6ff', padding: '15px', borderRadius: '8px' }}>
               <h4 style={{ margin: 0, color: '#1e3a8a', fontSize: '1.2rem' }}>סה"כ הצעה / לתשלום</h4>
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
            <h3 className={styles.sectionTitle}>הערות מיוחדות לניהול (פנימי)</h3>
            <div className={styles.inputGroup}>
              <textarea name="clientComments" value={formData.clientComments} onChange={handleChange} className={styles.input} rows={2} />
            </div>
          </div>
          
          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting || (!isOption && !contractSigned)} style={{ opacity: (!isOption && !contractSigned) ? 0.5 : 1 }}>
              {isSubmitting ? 'שומר נתונים, אנא המתן...' : (isOption ? 'שמירת אופציה (ויצירת הצעת מחיר)' : 'שמירת וסגירת אירוע')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookingForm;