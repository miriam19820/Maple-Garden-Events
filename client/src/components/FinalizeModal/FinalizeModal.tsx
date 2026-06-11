import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import styles from './BookingForm.module.css';
import { type TimeSlot, TIME_SLOTS, normalizeTimeSlot } from '../../utils/timeSlot';
import { parseNotesBundle, serializeNotesBundle } from '../../utils/notesStorage';
import { apiFetch } from '../../services/api';
import SignatureCanvas from 'react-signature-canvas';

// ייבוא מתוך התיקייה שנמצאת בתוך BookingForm
import ClientsSection from './sections/ClientsSection';
import EventSettingsSection from './sections/EventSettingsSection';
import PaymentAndUpgradesSection from './sections/PaymentAndUpgradesSection';
import ContractModal from './sections/ContractModal';
import MetaBar from './sections/MetaBar';
import { NotesList } from '../NotesList/NotesList';
import MenuDisplay from '../MenuDisplay/MenuDisplay';

// ייצוא קבועים כדי שיהיו זמינים לכל הקבצים
export const KOSHER_PRICING: Record<string, { label: string, extra: number }> = {
  machpud: { label: 'מחפוד', extra: 0 },
  rubin: { label: 'רובין', extra: 10 },
  kehilot: { label: 'קהילות', extra: 10 },
  gross: { label: 'הרב גרוס', extra: 10 },
  landa: { label: 'לנדא', extra: 20 },
  badatz: { label: 'בד"ץ העדה החרדית', extra: 20 },
};

export const UPGRADES_PRICING: Record<string, number> = {
  baseDesign: 4500, amplification: 1400, lighting: 1800, screens: 800,
  reception: 2000, separateReception: 3000, extraSecurity: 650, fireworks: 700,
};

interface BookingFormProps {
  initialDates?: any[];
  isOption?: boolean;
}

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
  const availableSlots = isEditMode ? TIME_SLOTS : TIME_SLOTS.filter((slot) => !takenSlots.includes(slot));
  const sigCanvas = useRef<SignatureCanvas>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingBooking, setLoadingBooking] = useState(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState(false);

  let datesToProcess: any[] = [];
  if (initialDates && initialDates.length > 0) datesToProcess = initialDates;
  else if (location.state?.selectedDates) datesToProcess = location.state.selectedDates;
  else if (location.state?.selectedDate) datesToProcess = [location.state.selectedDate];
  else if (location.state?.date) datesToProcess = [{ date: location.state.date, hebrewDate: location.state.hebrewDate || '' }];

  const [selectedDatesDisplay, setSelectedDatesDisplay] = useState<any[]>(datesToProcess);
  const isOptionMode = forcedIsOption || location.state?.isOption || datesToProcess.length > 1;
  const [isOption, setIsOption] = useState(isOptionMode);
  const [optionDurationHours, setOptionDurationHours] = useState(48);
  const [orderNumber, setOrderNumber] = useState('');

  const [formData, setFormData] = useState({
    createdBy: '', clientAFullName: '', clientAIdNumber: '', clientAPhone: '', clientAPhone2: '', clientAEmail: '', clientACity: '', clientAAddress: '',
    clientBFullName: '', clientBIdNumber: '', clientBPhone: '', clientBPhone2: '', clientBEmail: '', clientBCity: '', clientBAddress: '',
    calendarDateId: '', eventType: '', timeOfDay: '', startTime: '', endTime: '',
    guestCount: '', optionalGuestCount: '', finalPricePortion: '200', discountPercent: '', discountAmount: '', vatType: 'not_included', paymentTerms: '', leadSource: '', clientSignatureUrl: '',
  });

  const [menuNotesList, setMenuNotesList] = useState<string[]>([]);
  const [internalNotesList, setInternalNotesList] = useState<string[]>([]);
  const [servingStyle, setServingStyle] = useState('american');
  const [kosherType, setKosherType] = useState('machpud');
  const [upgrades, setUpgrades] = useState({
    baseDesign: true, amplification: false, lighting: false, screens: false, reception: false, separateReception: false, extraSecurity: false, fireworks: false,
  });
  const [depositMethod, setDepositMethod] = useState('');
  const [contractSigned, setContractSigned] = useState(false);
  const [isMenuViewOpen, setIsMenuViewOpen] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);

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
        const res = await apiFetch(`http://localhost:5000/api/bookings/next-code?prefix=${prefix}&count=${dateCount}`);
        const json = await res.json();
        if (!res.ok || !json.success) return;
        const codes: string[] = json.data.codes || [];
        if (codes.length === 0) return;
        if (codes.length === 1) setOrderNumber(codes[0]);
        else setOrderNumber(`${codes[0]} – ${codes[codes.length - 1]}`);
      } catch {}
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
        const eventDateStr = b.eventDate?.date ? new Date(b.eventDate.date).toISOString().split('T')[0] : '';
        setIsOption(b.eventDate?.status === 'OPTION');
        setOrderNumber(b.eventCode || b.id.slice(0, 8));
        if (eventDateStr) setSelectedDatesDisplay([{ date: eventDateStr, hebrewDate: '' }]);
        const parsedTime = parseStoredTimeOfDay(b.timeOfDay);
        
        setFormData({
          createdBy: b.createdBy || '',
          clientAFullName: b.clientAFullName || '', clientAIdNumber: b.clientAIdNumber || '', clientAPhone: phoneA.phone, clientAPhone2: phoneA.phone2, clientAEmail: b.clientAEmail || '', clientACity: addrA.city, clientAAddress: addrA.address,
          clientBFullName: b.clientBFullName || '', clientBIdNumber: b.clientBIdNumber || '', clientBPhone: phoneB.phone, clientBPhone2: phoneB.phone2, clientBEmail: b.clientBEmail || '', clientBCity: addrB.city, clientBAddress: addrB.address,
          calendarDateId: eventDateStr, eventType: b.eventType || '', timeOfDay: parsedTime.timeOfDay, startTime: parsedTime.startTime, endTime: parsedTime.endTime,
          guestCount: String(b.guestCount ?? ''), optionalGuestCount: '', finalPricePortion: String(b.finalPricePortion ?? '200'), discountPercent: '', discountAmount: '', vatType: 'not_included', paymentTerms: '', leadSource: b.leadSource || '', clientSignatureUrl: b.clientSignatureUrl || '',
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

  useEffect(() => {
    if (isEditMode || takenSlots.length === 0) return;
    const free = TIME_SLOTS.filter((slot) => !takenSlots.includes(slot));
    if (free.length === 1) setFormData((prev) => (prev.timeOfDay === free[0] ? prev : { ...prev, timeOfDay: free[0] }));
    else if (formData.timeOfDay && takenSlots.includes(formData.timeOfDay as TimeSlot)) setFormData((prev) => ({ ...prev, timeOfDay: '' }));
  }, [isEditMode, takenSlots.join(',')]);

  useEffect(() => {
    if (isEditMode) return;
    if (formData.eventType === 'חתונה') {
      setFormData((prev) => ({ ...prev, startTime: '18:00', endTime: '00:00', timeOfDay: takenSlots.includes('evening') ? prev.timeOfDay : 'evening' }));
    } else if (formData.eventType === 'ברית') {
      setFormData((prev) => ({ ...prev, startTime: '09:00', endTime: '14:00', timeOfDay: takenSlots.includes('morning') ? prev.timeOfDay : 'morning' }));
    }
  }, [formData.eventType, isEditMode, takenSlots.join(',')]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'radio' && name === 'vatType') return setFormData(prev => ({ ...prev, vatType: value }));
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleUpgradeChange = (key: keyof typeof upgrades) => {
    if (key === 'baseDesign') return;
    setUpgrades((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isHallOnly = servingStyle === 'hall_only';
  const isFoodRelevant = !isHallOnly;
  const isWedding = formData.eventType === 'חתונה';

  const calculateTotals = () => {
    let base = 0;
    Object.keys(upgrades).forEach((key) => {
      if (key === 'baseDesign' && isHallOnly) return; 
      if (upgrades[key as keyof typeof upgrades]) base += UPGRADES_PRICING[key];
    });
    if (isFoodRelevant) {
      const portions = Number(formData.guestCount) || 0;
      const basePrice = Number(formData.finalPricePortion) || 0;
      base += portions * (basePrice + KOSHER_PRICING[kosherType].extra);
    }
    let discountVal = 0;
    if (formData.discountPercent) discountVal += base * (Number(formData.discountPercent) / 100);
    if (formData.discountAmount) discountVal += Number(formData.discountAmount);
    let subtotal = Math.max(0, base - discountVal);
    let vatAmount = formData.vatType === 'not_included' ? subtotal * 0.18 : 0; 
    return { base, discountVal, subtotal, vatAmount, finalTotal: subtotal + vatAmount };
  };

  const totals = calculateTotals();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let signatureData = null;
    if (contractSigned && sigCanvas.current && !sigCanvas.current.isEmpty()) {
        signatureData = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
    }
    if (!isEditMode && !contractSigned) {
        alert('יש לחתום על החוזה בחלונית החתימה טרם השמירה.');
        return;
    }
    setIsSubmitting(true);
    
    try {
      const payload = {
        ...formData,
        clientComments: serializeNotesBundle({ menu: menuNotesList, internal: internalNotesList }),
        createdAt: new Date().toISOString(), allSelectedDates: selectedDatesDisplay, isOption, optionDurationHours,
        servingStyle, kosherType, upgrades, depositMethod, contractSigned, hasMusic: upgrades.amplification, calculatedTotals: totals, clientSignature: signatureData 
      };

      const url = isEditMode ? `http://localhost:5000/api/bookings/${editId}` : 'http://localhost:5000/api/bookings';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const resData = await response.json();

      if (response.ok) {
        const savedCode = resData.data?.[0]?.eventCode || resData.data?.eventCode;
        alert(isEditMode ? 'ההזמנה עודכנה בהצלחה!' : isOption ? `האופציה נשמרה בהצלחה!${savedCode ? `\nמספר אופציה: ${savedCode}` : ''}` : `האירוע נסגר ונשמר בהצלחה!${savedCode ? `\nמספר הזמנה: ${savedCode}` : ''}`);
        navigate('/');
      } else {
        alert(`שגיאה בשמירת הנתונים: ${resData.message || 'השרת החזיר שגיאה לא ידועה'}`);
        setIsSubmitting(false);
      }
    } catch (error) {
      alert("שגיאת התחברות לשרת - ודאי שהשרת פועל ברקע");
      setIsSubmitting(false);
    }
  };

  if (loadingBooking) return <div className={styles.container}><p className={styles.loadingText}>טוען...</p></div>;

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <div className={styles.header}>
          <img src="/logo.png" alt="מיפל" className={styles.headerLogo} />
          <div className={styles.headerText}>
            <h2 className={styles.title}>{isEditMode ? (isOption ? 'עריכת אופציה' : 'עריכת הזמנה') : (isOption ? 'שמירת אופציה לאירוע' : 'סגירת הזמנת אירוע')}</h2>
          </div>
        </div>

        <form className={styles.formBody} onSubmit={handleSubmit} style={{ direction: 'rtl' }}>
          <MetaBar formData={formData} handleChange={handleChange} isOption={isOption} orderNumber={orderNumber} optionDurationHours={optionDurationHours} setOptionDurationHours={setOptionDurationHours} selectedDatesDisplay={selectedDatesDisplay} />
          <ClientsSection formData={formData} handleChange={handleChange} errors={errors} setErrors={setErrors} isWedding={isWedding} styles={styles} />
          <EventSettingsSection formData={formData} handleChange={handleChange} isOption={isOption} availableSlots={availableSlots} takenSlots={takenSlots} isEditMode={isEditMode} servingStyle={servingStyle} setServingStyle={setServingStyle} kosherType={kosherType} setKosherType={setKosherType} isFoodRelevant={isFoodRelevant} selectedDatesDisplay={selectedDatesDisplay} setIsMenuViewOpen={setIsMenuViewOpen} styles={styles} />

          <div className={styles.sectionCard}>
            <h3 className={styles.sectionHeader}>הערות לתפריט ובקשות מיוחדות</h3>
            <NotesList notes={menuNotesList} onChange={setMenuNotesList} placeholder="לדוגמה: אלרגיות מיוחדות..." />
          </div>

          <PaymentAndUpgradesSection formData={formData} handleChange={handleChange} upgrades={upgrades} handleUpgradeChange={handleUpgradeChange} isHallOnly={isHallOnly} depositMethod={depositMethod} setDepositMethod={setDepositMethod} totals={totals} isFoodRelevant={isFoodRelevant} kosherType={kosherType} isEditMode={isEditMode} editId={editId} styles={styles} />

          <div className={styles.sectionCard}>
            <h3 className={styles.sectionHeader}>הערות פנימיות לניהול</h3>
            <NotesList notes={internalNotesList} onChange={setInternalNotesList} placeholder="הוסף הערה פנימית..." />
          </div>
          
          {/* הקופסה הירוקה לאישור החוזה - פותחת את המודאל בלחיצה */}
          {!isEditMode && (
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px', marginBottom: '20px', textAlign: 'right' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '1.05rem', color: '#1f293b', fontWeight: '500' }}>
                <input 
                  type="checkbox" 
                  checked={contractSigned} 
                  onChange={(e) => {
                    if (e.target.checked) {
                      setIsContractModalOpen(true); // לחיצה פותחת את המודאל
                    } else {
                      setContractSigned(false);
                      sigCanvas.current?.clear();
                    }
                  }} 
                  style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                />
                קראתי את החוזה, אני מאשר את התנאים וחותם
              </label>
              <div 
                onClick={() => setIsContractModalOpen(true)}
                style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', marginTop: '8px', fontSize: '0.95rem', paddingRight: '30px' }}
              >
                לחץ כאן לקריאת החוזה המלא ולחתימה דיגיטלית
              </div>
            </div>
          )}
          
          {/* כפתור השמירה הראשי (בלי הכפתור הכחול המיותר) */}
          <div className={styles.actions} style={{ display: 'flex', gap: '15px', justifyContent: 'flex-start', marginTop: '10px' }}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isSubmitting || (!isEditMode && !contractSigned)}
              style={{
                backgroundColor: '#A2C2A6', 
                color: 'white',
                padding: '12px 36px',
                borderRadius: '8px',
                border: 'none',
                cursor: (!isEditMode && !contractSigned) ? 'not-allowed' : 'pointer',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                opacity: (!isEditMode && !contractSigned) ? 0.6 : 1,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            >
              {isSubmitting ? 'שומר נתונים...' : isEditMode ? 'שמירת שינויים' : (isOption ? 'שמירת אופציה' : 'שמירת וסגירת אירוע')}
            </button>
          </div>

        </form>
      </div>

      <ContractModal isOpen={isContractModalOpen} onClose={() => setIsContractModalOpen(false)} isOption={isOption} sigCanvas={sigCanvas} setContractSigned={setContractSigned} styles={styles} />

      {isMenuViewOpen && (
         <div className={styles.menuOverlay}><div className={styles.menuModal}><button type="button" className={styles.menuCloseBtn} onClick={() => setIsMenuViewOpen(false)}>✕ סגור</button><div className={styles.menuModalContent}><MenuDisplay /></div></div></div>
      )}
    </div>
  );
};

export default BookingForm;