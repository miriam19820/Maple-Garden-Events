import React, { useState, useEffect } from 'react';
import styles from './OptionsManager.module.css';

const OptionsManager = () => {
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOptions = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/bookings');
      const result = await response.json();
      
      if (result.success) {
        // עכשיו השרת שולח את ה-eventDate, אז הסינון יעבוד!
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
        window.location.reload(); // מרענן את העמוד כדי שהלוח יתנקה ויחזור ללבן
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
        window.location.reload(); // מרענן כדי שהדד-ליין החדש יוצג במנהל
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
            const eventDateStr = option.eventDate?.date ? new Date(option.eventDate.date).toLocaleDateString('he-IL') : '';
            const expiresAtStr = option.eventDate?.optionExpiresAt ? new Date(option.eventDate.optionExpiresAt).toLocaleString('he-IL') : 'לא מוגדר';
            
            return (
              <div key={option.id} className={styles.card}>
                <div className={styles.cardContent}>
                  <div>
                    <h3 className={styles.eventDateText}>תאריך אירוע: <strong>{eventDateStr}</strong></h3>
                    <p className={styles.clientText}>
                      לקוח: {option.clientAFullName} | טלפון: {option.clientAPhone}
                    </p>
                    <p className={styles.expiryText}>
                      פג תוקף ב: {expiresAtStr}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <button onClick={() => handleBump(option.calendarDateId)} className={`${styles.btn} ${styles.bumpBtn}`}>
                      הקפץ לקוח (3 שעות) ⏱️
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
    </div>
  );
};

export default OptionsManager;