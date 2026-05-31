import React, { useState, useEffect } from 'react';
import styles from './OptionsManager.module.css';
import FinalizeModal from '../FinalizeModal/FinalizeModal'; 
import { socket } from '../../services/socketService';// הייבוא של המודל החדש!

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
      const dayNum = parseInt(dayPart, 10);
      const hebLetter = HEBREW_NUMERALS[dayNum];
      if (hebLetter) {
        return fullString.replace(dayPart, hebLetter); 
      }
    }
    return fullString;
  } catch (e) {
    return '';
  }
};

const OptionsManager = () => {
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // הסטייט החדש ששומר איזה לקוח נבחר לסגירה סופית כדי להעביר למודל
  const [selectedOptionForFinalize, setSelectedOptionForFinalize] = useState<any>(null);

  const fetchOptions = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/bookings');
      const result = await response.json();
      
      if (result.success) {
        const activeOptions = result.data.filter((b: any) => b.eventDate?.status === 'OPTION');
        setOptions(activeOptions);
      }
    } catch (error) {
      console.error("Error fetching options:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, []);
  // האזנה לעדכוני זמן אמת - כדי שהרשימה תתעדכן אוטומטית!
  useEffect(() => {
    socket.on('date-updated', () => {
      console.log('רשימת האופציות מתעדכנת בזמן אמת...');
      fetchOptions(); // קורא לפונקציה שלך שמושכת את האופציות מחדש
    });

    return () => {
      socket.off('date-updated');
    };
  }, []);

  const handleRelease = async (dateId: string) => {
    if (!window.confirm("האם את בטוחה שאת רוצה לשחרר את התאריך הזה? הוא יחזור להיות פנוי בלוח.")) return;

    try {
      const response = await fetch('http://localhost:5000/api/bookings/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateIds: [dateId] }), 
      });
      const result = await response.json();
      
      if (result.success) {
        alert("התאריך שוחרר בהצלחה!");
        fetchOptions(); // מרענן את הרשימה במקום לרענן את כל הדף
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert("שגיאה בשחרור התאריך.");
    }
  };

  const handleBump = async (dateId: string) => {
    if (!window.confirm("האם לשלוח ללקוח התראת דחיפות ולקצר את הדד-ליין ל-3 שעות?")) return;

    try {
      const response = await fetch('http://localhost:5000/api/bookings/bump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateId }),
      });
      const result = await response.json();
      
      if (result.success) {
        alert("הלקוח הוקפץ! הדד-ליין עודכן ל-3 שעות מעכשיו.");
        fetchOptions(); 
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert("שגיאה בהקפצת הלקוח.");
    }
  };

  if (loading) return <div className={styles.loading}>טוען נתונים...</div>;

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>
        ניהול אופציות פעילות ⏳
      </h2>
      
      {options.length === 0 ? (
        <p className={styles.emptyMessage}>אין כרגע תאריכים שממתינים באופציה.</p>
      ) : (
        <div className={styles.grid}>
          {options.map((option) => {
            const dateObj = option.eventDate?.date ? new Date(option.eventDate.date) : null;
            const eventDateStr = dateObj ? dateObj.toLocaleDateString('he-IL') : '';
            const hebrewDateStr = getHebrewDateString(dateObj);
            const expiresAtStr = option.eventDate?.optionExpiresAt ? new Date(option.eventDate.optionExpiresAt).toLocaleString('he-IL') : 'לא מוגדר';
            
            return (
              <div key={option.id} className={styles.card}>
                <div className={styles.cardContent}>
                  <div>
                    <h3 className={styles.eventDateText}>
                      תאריך אירוע: <strong>{eventDateStr}</strong> <span style={{ color: '#d97706', fontSize: '0.95rem' }}>({hebrewDateStr})</span>
                    </h3>
                    <p className={styles.clientText}>
                      לקוח: {option.clientAFullName} | טלפון: {option.clientAPhone}
                    </p>
                    <p className={styles.expiryText}>
                      פג תוקף ב: {expiresAtStr}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    {/* הכפתור החדש שמפעיל את המודל */}
                    <button 
                      onClick={() => setSelectedOptionForFinalize(option)} 
                      className={`${styles.btn} ${styles.finalizeBtn}`}
                    >
                      סגירה סופית 💳
                    </button>
                    
                    <button onClick={() => handleBump(option.calendarDateId)} className={`${styles.btn} ${styles.bumpBtn}`}>
                      הקפץ לקוח ⏱️
                    </button>
                    <button onClick={() => handleRelease(option.calendarDateId)} className={`${styles.btn} ${styles.releaseBtn}`}>
                      שחרר תאריך 🔓
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* קריאה למודל הסגירה רק אם נבחרה אופציה */}
      {selectedOptionForFinalize && (
        <FinalizeModal
          dateId={selectedOptionForFinalize.calendarDateId}
          clientName={selectedOptionForFinalize.clientAFullName}
          onClose={() => setSelectedOptionForFinalize(null)}
          onSuccess={() => {
            setSelectedOptionForFinalize(null);
            fetchOptions(); // מרענן את הרשימה אחרי סגירה מוצלחת!
          }}
        />
      )}
    </div>
  );
};

export default OptionsManager;