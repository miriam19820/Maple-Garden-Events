import React, { useState } from 'react';
import styles from './BookingForm.module.css';
import MenuDisplay from '../MenuDisplay/MenuDisplay';
import { Calendar } from '../Calendar/Calendar'; 

const BookingForm = () => {
  const [formData, setFormData] = useState({
    clientAFullName: '', clientAIdNumber: '', clientAPhone: '', clientAPhone2: '', clientAEmail: '', clientACity: '', clientAAddress: '',
    clientBFullName: '', clientBIdNumber: '', clientBPhone: '', clientBPhone2: '', clientBEmail: '', clientBCity: '', clientBAddress: '',
    calendarDateId: '', eventType: '', timeOfDay: '', guestCount: '', finalPricePortion: '', managerComments: '', clientComments: ''
  });

  const [showMenu, setShowMenu] = useState(false);
  const [activeEmailField, setActiveEmailField] = useState<string | null>(null);
  
  // המשתנה החדש שנועל את הכפתור!
  const [isSubmitting, setIsSubmitting] = useState(false); 
  
  const emailSuffixes = ['@gmail.com', '@hotmail.com', '@outlook.com', '@yahoo.com', '@icloud.com', '@walla.co.il'];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEmailSelect = (fieldName: string, suffix: string) => {
    const baseEmail = formData[fieldName as keyof typeof formData].split('@')[0];
    setFormData(prev => ({ ...prev, [fieldName]: baseEmail + suffix }));
    setActiveEmailField(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // מונע שליחה נוספת אם כבר התחלנו לשמור (חוסם דאבל-קליק)
    if (isSubmitting) return; 
    
    setIsSubmitting(true); // נועלים את הכפתור

    try {
      // פנייה אמיתית לשרת לשמירת הנתונים
      const response = await fetch('http://localhost:5000/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        // מעבר לתפריט *רק* אם השרת אישר שהנתונים נשמרו בהצלחה!
        setShowMenu(true);
      } else {
        alert("שגיאה בשמירת הנתונים - השרת החזיר שגיאה");
        setIsSubmitting(false); // משחררים את הנעילה אם הייתה שגיאה כדי שאפשר יהיה לנסות שוב
      }
    } catch (error) {
      console.error("Error:", error);
      alert("שגיאת התחברות לשרת - ודאי שהשרת פועל ברקע");
      setIsSubmitting(false); // משחררים את הנעילה
    }
  };

  const isWedding = formData.eventType === 'חתונה';
  const eventTypesList = ['חתונה', 'אירוסין', 'בר מצווה', 'בת מצווה', 'ברית', 'בריתה', 'חינה', 'הרמת כוסית', 'כנס מקצועי', 'אירוע חברה/עסקי'];

  if (showMenu) {
    return (
      <div className={styles.container}>
         <MenuDisplay /> 
      </div>
    );
  }

  return (
    
    <div className={styles.container}>
      <div className={styles.formCard}>
        <div className={styles.header}>
          <h2 className={styles.title}>יצירת אירוע חדש <span className={styles.titleAccent}>| מייפל</span></h2>
          {/* כאן אנחנו מוסיפות את הלוח */}
  <div style={{ padding: '20px' }}>
     <Calendar onDateSelect={(day) => setFormData(prev => ({ ...prev, calendarDateId: day.date }))} />
  </div>

  <form className={styles.formBody} onSubmit={handleSubmit}></form>
          <p className={styles.subtitle}>הזנת נתונים למערכת - מחובר ישירות ליומן האירועים המרכזי</p>
        </div>

        <form className={styles.formBody} onSubmit={handleSubmit}>
          <div className={styles.eventDetailsSection}>
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
                <label>מועד האירוע </label>
                <select name="timeOfDay" required onChange={handleChange} className={styles.input}>
                  <option value="">בחירת שעה</option>
                  <option value="בוקר">בוקר</option>
                  <option value="צהריים">צהריים</option>
                  <option value="ערב">ערב</option>
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label>תאריך</label>
                <input type="date" name="calendarDateId" value={formData.calendarDateId} readOnly className={styles.input} />
              </div>
              <div className={styles.inputGroup}>
                <label>כמות מוזמנים </label>
                <input type="number" name="guestCount" required onChange={handleChange} className={styles.input} />
                {formData.guestCount && Number(formData.guestCount) < 350 && (
                  <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem', fontWeight: 'bold', display: 'block' }}>
                    אירוע קטן מתחת לסטנדרט
                  </span>
                )}
              </div>
              <div className={styles.inputGroup}>
                <label>מחיר מנה בסיסי *</label>
                <input type="number" name="finalPricePortion" required onChange={handleChange} className={styles.input} />
              </div>
            </div>
          </div>

          <div className={isWedding ? styles.clientsSectionWedding : styles.clientsSectionSingle}>
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

          <div className={styles.actions}>
            {/* הכפתור עכשיו משתנה וננעל בזמן שמירה! */}
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? 'שומר נתונים, אנא המתן...' : 'שמירת הפרטים ומעבר לצפייה בתפריט'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookingForm;