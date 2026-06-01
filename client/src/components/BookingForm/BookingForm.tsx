import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './BookingForm.module.css';
import MenuDisplay from '../MenuDisplay/MenuDisplay';



const BookingForm = () => {

  const navigate = useNavigate();

  const location = useLocation();



  // זיהוי התאריכים שהגיעו מהניווט

  let initialDates: any[] = [];

  if (location.state?.selectedDates) {

    initialDates = location.state.selectedDates;

  } else if (location.state?.selectedDate) {

    initialDates = [location.state.selectedDate];

  } else if (location.state?.date) {
    initialDates = [{ date: location.state.date, hebrewDate: location.state.hebrewDate || '' }];

  }



  // יצרנו סטייט חדש שמחזיק את התאריכים להצגה (כדי שנוכל לעדכן אותו גם מהלוח הפנימי)

  const [selectedDatesDisplay, setSelectedDatesDisplay] = useState<any[]>(initialDates);



  const [formData, setFormData] = useState({

    clientAFullName: '', clientAIdNumber: '', clientAPhone: '', clientAPhone2: '', clientAEmail: '', clientACity: '', clientAAddress: '',

    clientBFullName: '', clientBIdNumber: '', clientBPhone: '', clientBPhone2: '', clientBEmail: '', clientBCity: '', clientBAddress: '',

    calendarDateId: '', eventType: '', timeOfDay: '', guestCount: '', finalPricePortion: '', managerComments: '', clientComments: '',

    // שדות חדשים לאקו"ם:
 

  });

 

  // האם להציג ללקוח שזו אופציה או סגירה (אם באנו מהלוח עם כמה תאריכים זה אוטומטית אופציה)

  const [isOption, setIsOption] = useState(location.state?.isOption || initialDates.length > 1);

  const [optionDurationHours, setOptionDurationHours] = useState(48); // ברירת מחדל 48 שעות

 



  // עדכון התאריך בטופס הנסתר בהתאם לתאריכים שמוצגים

  useEffect(() => {

    if (selectedDatesDisplay.length > 0) {

      const firstDate = typeof selectedDatesDisplay[0] === 'object' ? selectedDatesDisplay[0].date : selectedDatesDisplay[0];

      setFormData(prev => ({ ...prev, calendarDateId: firstDate || '' }));

    }

  }, [selectedDatesDisplay]);



  const [showMenu, setShowMenu] = useState(false);

  const [activeEmailField, setActiveEmailField] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

 

  const emailSuffixes = ['@gmail.com', '@hotmail.com', '@outlook.com', '@yahoo.com', '@icloud.com', '@walla.co.il'];



  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {

    const { name, value } = e.target;

    setFormData(prev => ({ ...prev, [name]: value }));

  };



const handleEmailSelect = (fieldName: string, suffix: string) => {

    const currentValue = formData[fieldName as keyof typeof formData] as string;

    const baseEmail = currentValue.split('@')[0];

    setFormData(prev => ({ ...prev, [fieldName]: baseEmail + suffix }));

    setActiveEmailField(null);

  };



  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (isSubmitting) return;

    setIsSubmitting(true);



    try {

      const payload = {

        ...formData,

        allSelectedDates: selectedDatesDisplay,

        isOption: isOption,

        optionDurationHours: optionDurationHours

      };

     

      const response = await fetch('http://localhost:5000/api/bookings', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(payload),

      });



      const resData = await response.json();



      if (response.ok) {

        setShowMenu(true);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <button onClick={() => navigate('/')} style={{ background: '#e2e8f0', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold' }}>← חזרה ללוח</button>
            <h2 className={styles.title}>יצירת אירוע חדש <span className={styles.titleAccent}>| מייפל</span></h2>
          </div>

          {/* התיבה שונתה לעבוד מול הסטייט החדש */}

          {selectedDatesDisplay && selectedDatesDisplay.length > 0 && (

            <div className={styles.selectedDatesBox} style={{ margin: '15px 0', padding: '15px', backgroundColor: '#fffbeb', border: '1px solid #d97706', borderRadius: '8px', textAlign: 'right', direction: 'rtl' }}>

              <strong style={{ display: 'block', marginBottom: '8px', color: '#92400e' }}>תאריכים נבחרים לאירוע:</strong>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>

                {selectedDatesDisplay.map((d: any, index: number) => {

                  const dateStr = typeof d === 'object' ? d.date : d;

                  const hebrew = typeof d === 'object' ? d.hebrewDate : '';

                  const formattedDate = dateStr ? dateStr.split('-').reverse().join('-') : '';

                 

                  return (

                    <span key={index} style={{ padding: '4px 12px', background: '#fff', border: '1px solid #f59e0b', borderRadius: '20px', fontSize: '0.95rem', display: 'inline-block' }}>

                      {formattedDate} {hebrew ? ` - ${hebrew}` : ''}

                    </span>

                  );

                })}

              </div>

            </div>

          )}



          <p className={styles.subtitle}>הזנת נתונים למערכת - מחובר ישירות ליומן האירועים המרכזי</p>
        </div>



        <form className={styles.formBody} onSubmit={handleSubmit}>



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



          <div className={styles.inputGroup} style={{ marginTop: '20px', padding: '0 20px' }}>

            <label style={{ color: '#d97706', fontWeight: 'bold' }}>סוג העסקה</label>

            <select

              value={isOption ? 'OPTION' : 'BOOKED'}

              onChange={(e) => setIsOption(e.target.value === 'OPTION')}

              className={styles.input}

              style={{ borderBottomColor: '#d97706', backgroundColor: '#fffbeb', maxWidth: '300px' }}

            >

              <option value="BOOKED">סגירה סופית (BOOKED)</option>

              <option value="OPTION">שמירת אופציה זמנית (OPTION)</option>

            </select>

          </div>



          {/* התפריט הזה יופיע רק אם המנהל בחר שזה "שמירת אופציה" */}

          {isOption && (

            <div className={styles.inputGroup} style={{ padding: '0 20px', marginTop: '10px' }}>

              <label style={{ color: '#dc2626', fontWeight: 'bold' }}>תוקף האופציה ⏳</label>

              <select

                value={optionDurationHours}

                onChange={(e) => setOptionDurationHours(Number(e.target.value))}

                className={styles.input}

                style={{ borderBottomColor: '#dc2626', maxWidth: '300px' }}

              >

                <option value={12}>12 שעות</option>

                <option value={24}>24 שעות (יממה)</option>

                <option value={48}>48 שעות (יומיים)</option>

                <option value={72}>72 שעות (3 ימים)</option>

                <option value={168}>שבוע ימים</option>

              </select>

            </div>

          )}



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



          <div className={styles.actions}>

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