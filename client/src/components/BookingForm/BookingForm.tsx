import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import styles from './BookingForm.module.css';
import { type TimeSlot, SLOT_LABELS, normalizeTimeSlot } from '../../utils/timeSlot';
import { parseNotesBundle, serializeNotesBundle } from '../../utils/notesStorage';
import { NotesList } from '../NotesList/NotesList';

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

const parseCombinedPhone = (combined: string | null | undefined) => {
  if (!combined) return { phone: '', phone2: '' };
  const marker = ' | נוסף: ';
  const idx = combined.indexOf(marker);
  if (idx === -1) return { phone: combined, phone2: '' };
  return { phone: combined.slice(0, idx), phone2: combined.slice(idx + marker.length) };
};

const parseAddress = (combined: string | null | undefined) => {
  if (!combined) return { city: '', address: '' };
  const idx = combined.indexOf(', ');
  if (idx === -1) return { city: '', address: combined };
  return { city: combined.slice(0, idx), address: combined.slice(idx + 2) };
};

const parseStoredTimeOfDay = (stored: string | null | undefined) => {
  if (!stored) return { timeOfDay: '', startTime: '', endTime: '' };
  const pipeParts = stored.split('|');
  const main = pipeParts[0]?.trim() || stored;
  const timePart = pipeParts[1]?.trim();
  const partOfDay = ['morning', 'noon', 'evening'];
  if (partOfDay.includes(main)) {
    if (timePart?.includes(' - ')) {
      const [start, end] = timePart.split(' - ');
      return { timeOfDay: main, startTime: start.trim(), endTime: end.trim() };
    }
    return { timeOfDay: main, startTime: '', endTime: '' };
  }
  if (stored.includes(' - ')) {
    const [start, end] = stored.split(' - ');
    const slot = normalizeTimeSlot(stored, start.trim());
    return { timeOfDay: slot || '', startTime: start.trim(), endTime: end.trim() };
  }
  return { timeOfDay: main, startTime: '', endTime: '' };
};

const BookingForm = ({ initialDates, isOption: forcedIsOption }: BookingFormProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = !!editId;
  const takenSlots: TimeSlot[] = (location.state?.takenSlots as TimeSlot[]) || [];
  const isSlotTaken = (slot: TimeSlot) => !isEditMode && takenSlots.includes(slot);

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

  const [selectedDatesDisplay, setSelectedDatesDisplay] = useState<any[]>(datesToProcess);
  const [loadingBooking, setLoadingBooking] = useState(isEditMode);

  const isOptionMode = forcedIsOption || location.state?.isOption || datesToProcess.length > 1;
  const [isOption, setIsOption] = useState(isOptionMode);
  const [optionDurationHours, setOptionDurationHours] = useState(48);

  const [orderNumber, setOrderNumber] = useState('');

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
    leadSource: '',
  });

  const [menuNotesList, setMenuNotesList] = useState<string[]>([]);
  const [internalNotesList, setInternalNotesList] = useState<string[]>([]);

  useEffect(() => {
    if (isEditMode) return;
    if (formData.eventType === 'חתונה') {
      setFormData(prev => ({ ...prev, startTime: '18:00', endTime: '00:00', timeOfDay: 'evening' }));
    } else if (formData.eventType === 'ברית') {
      setFormData(prev => ({ ...prev, startTime: '09:00', endTime: '14:00', timeOfDay: 'morning' }));
    }
  }, [formData.eventType, isEditMode]);

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

  useEffect(() => {
    if (isEditMode) return;

    const dateCount = Math.max(selectedDatesDisplay.length, 1);
    const prefix = isOption ? 'OPT' : 'EVT';

    const loadNextCode = async () => {
      try {
        const res = await fetch(
          `http://localhost:5000/api/bookings/next-code?prefix=${prefix}&count=${dateCount}`
        );
        const json = await res.json();
        if (!res.ok || !json.success) return;

        const codes: string[] = json.data.codes || [];
        if (codes.length === 0) return;
        if (codes.length === 1) {
          setOrderNumber(codes[0]);
        } else {
          setOrderNumber(`${codes[0]} – ${codes[codes.length - 1]}`);
        }
      } catch {
        // keep empty until server responds
      }
    };

    loadNextCode();
  }, [isEditMode, isOption, selectedDatesDisplay.length]);

  useEffect(() => {
    if (!editId) return;

    const loadBooking = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/bookings/${editId}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          alert(json.message || 'שגיאה בטעינת ההזמנה');
          navigate('/');
          return;
        }

        const b = json.data;
        const phoneA = parseCombinedPhone(b.clientAPhone);
        const phoneB = parseCombinedPhone(b.clientBPhone);
        const addrA = parseAddress(b.clientAAddress);
        const addrB = parseAddress(b.clientBAddress);
        const eventDateStr = b.eventDate?.date
          ? new Date(b.eventDate.date).toISOString().split('T')[0]
          : '';

        setIsOption(b.eventDate?.status === 'OPTION');
        setOrderNumber(b.eventCode || b.id.slice(0, 8));
        if (eventDateStr) {
          setSelectedDatesDisplay([{ date: eventDateStr, hebrewDate: '' }]);
        }

        const parsedTime = parseStoredTimeOfDay(b.timeOfDay);
        setFormData({
          createdBy: b.createdBy || '',
          clientAFullName: b.clientAFullName || '',
          clientAIdNumber: b.clientAIdNumber || '',
          clientAPhone: phoneA.phone,
          clientAPhone2: phoneA.phone2,
          clientAEmail: b.clientAEmail || '',
          clientACity: addrA.city,
          clientAAddress: addrA.address,
          clientBFullName: b.clientBFullName || '',
          clientBIdNumber: b.clientBIdNumber || '',
          clientBPhone: phoneB.phone,
          clientBPhone2: phoneB.phone2,
          clientBEmail: b.clientBEmail || '',
          clientBCity: addrB.city,
          clientBAddress: addrB.address,
          calendarDateId: eventDateStr,
          eventType: b.eventType || '',
          timeOfDay: parsedTime.timeOfDay,
          startTime: parsedTime.startTime,
          endTime: parsedTime.endTime,
          guestCount: String(b.guestCount ?? ''),
          optionalGuestCount: '',
          finalPricePortion: String(b.finalPricePortion ?? '200'),
          discountPercent: '',
          discountAmount: '',
          vatType: 'not_included',
          paymentTerms: '',
          leadSource: b.leadSource || '',
        });
        const notesBundle = parseNotesBundle(b.clientComments || '');
        setMenuNotesList(notesBundle.menu);
        setInternalNotesList(notesBundle.internal);
        setContractSigned(!!b.isContractSigned);
        if (b.hasMusic !== undefined) setUpgrades(prev => ({ ...prev, amplification: b.hasMusic }));
      } catch {
        alert('שגיאה בטעינת ההזמנה');
        navigate('/');
      } finally {
        setLoadingBooking(false);
      }
    };

    loadBooking();
  }, [editId, navigate]);

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
    
    if (!isEditMode && !isOption && !contractSigned) {
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

    if (!isEditMode && formData.timeOfDay) {
      const slot = normalizeTimeSlot(formData.timeOfDay, formData.startTime);
      if (slot && takenSlots.includes(slot)) {
        alert(`משבצת ${SLOT_LABELS[slot]} כבר תפוסה בתאריך זה. בחרי משבצת אחרת.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        clientComments: serializeNotesBundle({
          menu: menuNotesList,
          internal: internalNotesList,
        }),
        createdAt: new Date().toISOString(), 
        allSelectedDates: selectedDatesDisplay,
        isOption: isOption,
        optionDurationHours: optionDurationHours,
        servingStyle, kosherType, upgrades, depositMethod, contractSigned,
        hasMusic: upgrades.amplification,
        calculatedTotals: totals
      };
      
      const url = isEditMode
        ? `http://localhost:5000/api/bookings/${editId}`
        : 'http://localhost:5000/api/bookings';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();

      if (response.ok) {
        const savedCode = resData.data?.[0]?.eventCode || resData.data?.eventCode;
        alert(
          isEditMode
            ? 'ההזמנה עודכנה בהצלחה!'
            : isOption
              ? `האופציה נשמרה בהצלחה!${savedCode ? `\nמספר אופציה: ${savedCode}` : ''}`
              : `האירוע נסגר ונשמר בהצלחה!${savedCode ? `\nמספר הזמנה: ${savedCode}` : ''}`
        );
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

  if (loadingBooking) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>טוען פרטי הזמנה...</p>
      </div>
    );
  }

  const pageTitle = isEditMode
    ? (isOption ? 'עריכת אופציה' : 'עריכת הזמנה')
    : (isOption ? 'שמירת אופציה לאירוע' : 'סגירת הזמנת אירוע');

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <div className={styles.header}>
          <img src="/logo.png" alt="מיפל" className={styles.headerLogo} />
          <div className={styles.headerText}>
            <h2 className={styles.title}>{pageTitle}</h2>
            {isOption && !isEditMode && (
              <p className={styles.subtitle}>שמירת תאריכים זמנית — ניתן להשלים ולסגור בהמשך</p>
            )}
            {isEditMode && (
              <p className={styles.subtitle}>ניתן לערוך פרטים עד יום לפני האירוע (התאריך אינו ניתן לשינוי)</p>
            )}
            {!isOption && !isEditMode && (
              <p className={styles.subtitle}>מילוי פרטים וסגירת האירוע</p>
            )}
          </div>
        </div>

        <form className={styles.formBody} onSubmit={handleSubmit} style={{ direction: 'rtl' }}>
          
          <div className={styles.metaBar}>
            <div className={styles.inputGroup}>
              <label className={styles.metaLabel}>מספר {isOption ? 'אופציה' : 'הזמנה'}</label>
              <input type="text" value={orderNumber} readOnly className={`${styles.input} ${styles.inputReadonly}`} />
            </div>
            
            <div className={styles.inputGroup}>
              <label className={styles.metaLabel}>שם הנציג / סוכן *</label>
              <select name="createdBy" required value={formData.createdBy} onChange={handleChange} className={styles.input}>
                <option value="">בחרי נציג מהרשימה</option>
                {representatives.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.metaLabel}>סוג אירוע *</label>
              <select name="eventType" required value={formData.eventType} onChange={handleChange} className={styles.input}>
                <option value="">בחרי מסוגי האירועים</option>
                {eventTypesList.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>

            {isOption && (
              <div className={styles.inputGroup}>
                <label className={styles.metaLabel}>תוקף אופציה (בשעות)</label>
                <input type="number" value={optionDurationHours} onChange={(e) => setOptionDurationHours(Number(e.target.value))} className={styles.input} />
              </div>
            )}
            
            <div className={styles.inputGroup}>
              <label className={styles.metaLabel}>תאריך {isOption ? 'פתיחת האופציה' : 'סגירת האירוע'}</label>
              <input type="text" value={currentDateDisplay} readOnly className={`${styles.input} ${styles.inputReadonly}`} style={{ direction: 'ltr', textAlign: 'right' }} />
            </div>
          </div>
          
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionHeader}>פרטי בעלי השמחה</h3>
          <div className={isWedding ? styles.clientsSectionWedding : styles.clientsSectionSingle}>
            <div className={styles.clientBlock}>
              <h3 className={styles.sectionTitlePrimary}>{isWedding ? "פרטי צד החתן" : "פרטי בעל השמחה / הלקוח"}</h3>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}>
                  <label>שם מלא </label>
                  <input type="text" name="clientAFullName" required value={formData.clientAFullName} onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientAFullName ? styles.inputError : ''}`} />
                  {errors.clientAFullName && <span className={styles.errorMsg}>{errors.clientAFullName}</span>}
                </div>
                <div className={styles.inputGroup}>
                  <label>תעודת זהות</label>
                  <input type="text" name="clientAIdNumber" value={formData.clientAIdNumber} onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientAIdNumber ? styles.inputError : ''}`} />
                  {errors.clientAIdNumber && <span className={styles.errorMsg}>{errors.clientAIdNumber}</span>}
                </div>
              </div>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}>
                  <label>מספר טלפון 1 *</label>
                  <input type="tel" name="clientAPhone" required value={formData.clientAPhone} onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientAPhone ? styles.inputError : ''}`} />
                  {errors.clientAPhone && <span className={styles.errorMsg}>{errors.clientAPhone}</span>}
                </div>
                <div className={styles.inputGroup}>
                  <label>מספר טלפון 2</label>
                  <input type="tel" name="clientAPhone2" value={formData.clientAPhone2} onChange={handleChange} className={styles.input} />
                </div>
              </div>

              <div className={`${styles.inputGroup} ${styles.emailWrap}`}>
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
                      >
                        {formData.clientAEmail.split('@')[0]}{s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.inputRow}>
                <div className={styles.inputGroup}><label>עיר </label><input type="text" name="clientACity" value={formData.clientACity} onChange={handleChange} className={styles.input} /></div>
                <div className={styles.inputGroup}><label>כתובת (רחוב ומספר) </label><input type="text" name="clientAAddress" value={formData.clientAAddress} onChange={handleChange} className={styles.input} /></div>
              </div>
            </div>

            {isWedding && (
              <div className={styles.clientBlock}>
                <h3 className={styles.sectionTitleSecondary}>פרטי צד הכלה</h3>
                <div className={styles.inputRow}>
                  <div className={styles.inputGroup}>
                    <label>שם מלא </label>
                    <input type="text" name="clientBFullName" required={isWedding} value={formData.clientBFullName} onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientBFullName ? styles.inputError : ''}`} />
                    {errors.clientBFullName && <span className={styles.errorMsg}>{errors.clientBFullName}</span>}
                  </div>
                  <div className={styles.inputGroup}>
                    <label>תעודת זהות</label>
                    <input type="text" name="clientBIdNumber" value={formData.clientBIdNumber} onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientBIdNumber ? styles.inputError : ''}`} />
                    {errors.clientBIdNumber && <span className={styles.errorMsg}>{errors.clientBIdNumber}</span>}
                  </div>
                </div>
                <div className={styles.inputRow}>
                  <div className={styles.inputGroup}>
                    <label>מספר טלפון 1 *</label>
                    <input type="tel" name="clientBPhone" required={isWedding} value={formData.clientBPhone} onChange={handleChange} onBlur={e => validateField(e.target.name, e.target.value)} className={`${styles.input} ${errors.clientBPhone ? styles.inputError : ''}`} />
                    {errors.clientBPhone && <span className={styles.errorMsg}>{errors.clientBPhone}</span>}
                  </div>
                  <div className={styles.inputGroup}>
                    <label>מספר טלפון 2</label>
                    <input type="tel" name="clientBPhone2" value={formData.clientBPhone2} onChange={handleChange} className={styles.input} />
                  </div>
                </div>
                <div className={`${styles.inputGroup} ${styles.emailWrap}`}>
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
                        >
                          {formData.clientBEmail.split('@')[0]}{s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={styles.inputRow}>
                  <div className={styles.inputGroup}><label>עיר </label><input type="text" name="clientBCity" value={formData.clientBCity} onChange={handleChange} className={styles.input} /></div>
                  <div className={styles.inputGroup}><label>כתובת (רחוב ומספר) </label><input type="text" name="clientBAddress" value={formData.clientBAddress} onChange={handleChange} className={styles.input} /></div>
                </div>
              </div>
            )}
          </div>
          </div>

          <div className={styles.sectionCard}>
            <h3 className={styles.sectionHeader}>הגדרות אירוע, זמנים ותפריט</h3>
          <div className={styles.eventDetailsGrid}>
            <div className={styles.inputGroup}>
              <label>דרך מי הגיעו? (מקור הגעה)</label>
              <input type="text" name="leadSource" value={formData.leadSource} onChange={handleChange} className={styles.input} placeholder="לדוגמה: פייסבוק, חבר שהמליץ..." />
            </div>
            
            <div className={styles.inputGroup}>
              <label>{isOption ? 'תאריכים אופציונליים (לועזי)' : 'תאריך אירוע סופי (לועזי)'}</label>
              <input type="text" name="calendarDateId" value={dateStr} readOnly className={`${styles.input} ${styles.inputReadonly}`} />
            </div>

            <div className={styles.inputGroup}>
              <label>{isOption ? 'תאריכים אופציונליים (עברי)' : 'תאריך אירוע סופי (עברי)'}</label>
              <input type="text" value={hebrewDateDisplay} readOnly className={`${styles.input} ${styles.dateReadonly}`} />
            </div>

            {/* --- הוספת זמן אירוע בוקר/צהריים/ערב --- */}
            <div className={styles.inputGroup}>
              <label>זמן ביום *</label>
              <select name="timeOfDay" required value={formData.timeOfDay} onChange={handleChange} className={styles.input}>
                <option value="">בחרי חלק ביום</option>
                <option value="morning" disabled={isSlotTaken('morning')}>
                  בוקר{isSlotTaken('morning') ? ' (תפוס)' : ''}
                </option>
                <option value="noon" disabled={isSlotTaken('noon')}>
                  צהריים{isSlotTaken('noon') ? ' (תפוס)' : ''}
                </option>
                <option value="evening" disabled={isSlotTaken('evening')}>
                  ערב{isSlotTaken('evening') ? ' (תפוס)' : ''}
                </option>
              </select>
              {takenSlots.length > 0 && !isEditMode && (
                <span className={styles.slotHint}>
                  משבצות תפוסות: {takenSlots.map((s) => SLOT_LABELS[s]).join(', ')}
                </span>
              )}
            </div>

            <div className={`${styles.inputGroup} ${styles.splitRow}`}>
              <div className={styles.inputGroup}>
                <label>משעה מדוייקת</label>
                <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className={styles.input} />
              </div>
              <div className={styles.inputGroup}>
                <label>עד שעה מדוייקת</label>
                <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className={styles.input} />
              </div>
            </div>
            <p className={styles.timeNote}>
              * לאחר סיום שעות האירוע המוגדרות תיתכן תוספת תשלום על כל שעה נוספת.
            </p>

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
                <div className={styles.splitRow}>
                  <div className={styles.inputGroup}>
                    <label>כמות מנות (בפועל)</label>
                    <input type="number" name="guestCount" required value={formData.guestCount} onChange={handleChange} className={styles.input} />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>מנות אופציה (רזרבה)</label>
                    <input type="number" name="optionalGuestCount" value={formData.optionalGuestCount} onChange={handleChange} className={styles.input} />
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
                  <div onClick={() => window.open('/menu', '_blank')} className={styles.menuLinkBtn} role="button" tabIndex={0}>
                    📄 פתיחה וצפייה בתפריט
                  </div>
                </div>
              </>
            )}
          </div>
          </div>

          <div className={styles.sectionCard}>
            <h3 className={styles.sectionHeader}>הערות לתפריט ובקשות מיוחדות</h3>
            <NotesList
              notes={menuNotesList}
              onChange={setMenuNotesList}
              placeholder="לדוגמה: אלרגיות מיוחדות, בקשה להחלפת מנה מסוימת..."
            />
          </div>

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

            <div className={styles.contractBox}>
              <label className={styles.contractLabel}>
                <input type="checkbox" checked={contractSigned} onChange={(e) => setContractSigned(e.target.checked)} />
                <span>
                  קראתי את החוזה, אני מאשר את התנאים וחותם
                  {isOption && <span className={styles.contractOptional}> — לא חובה בשמירת אופציה</span>}
                </span>
              </label>
            </div>

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

          <div className={styles.sectionCard}>
            <h3 className={styles.sectionHeader}>הערות פנימיות לניהול</h3>
            <NotesList
              notes={internalNotesList}
              onChange={setInternalNotesList}
              placeholder="הוסף הערה פנימית..."
            />
          </div>
          
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isSubmitting || (!isEditMode && !isOption && !contractSigned)}
            >
              {isSubmitting
                ? 'שומר נתונים, אנא המתן...'
                : isEditMode
                  ? 'שמירת שינויים'
                  : (isOption ? 'שמירת אופציה (ויצירת הצעת מחיר)' : 'שמירת וסגירת אירוע')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookingForm;