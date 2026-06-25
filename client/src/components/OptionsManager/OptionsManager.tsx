import React, { useState, useEffect } from 'react';
import styles from './OptionsManager.module.css';
import OptionActionModal from '../OptionActionModal/OptionActionModal';
import NotifyOptionModal from '../NotifyOptionModal/NotifyOptionModal';
import { socket } from '../../services/socketService';
import { apiFetch } from '../../services/api';

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

const OptionsManager = () => {
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [notifyOption, setNotifyOption] = useState<any>(null);

  const fetchOptions = async () => {
    try {
      setLoading(true);
      const response = await apiFetch('http://localhost:5000/api/bookings');
      const result = await response.json();
      if (result.success) {
        setOptions(result.data.filter((b: any) => b.eventDate?.status === 'OPTION'));
      }
    } catch (error) {
      console.error('Error fetching options:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOptions(); }, []);

  useEffect(() => {
    socket.on('date-updated', fetchOptions);
    return () => { socket.off('date-updated', fetchOptions); };
  }, []);

  const handleRelease = async (dateId: string) => {
    if (!window.confirm('האם את בטוחה שאת רוצה לשחרר את התאריך הזה?')) return;
    try {
      const res = await apiFetch('http://localhost:5000/api/bookings/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateIds: [dateId] }),
      });
      const result = await res.json();
      if (result.success) { alert('התאריך שוחרר בהצלחה!'); fetchOptions(); }
      else alert(result.message);
    } catch { alert('שגיאה בשחרור התאריך.'); }
  };

  const handleBump = async (dateId: string) => {
    if (!window.confirm('האם לשלוח ללקוח התראת דחיפות ולקצר את הדד-ליין ל-3 שעות?')) return;
    try {
      const res = await apiFetch('http://localhost:5000/api/bookings/bump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateId }),
      });
      const result = await res.json();
      if (result.success) { alert('הלקוח הוקפץ! הדד-ליין עודכן ל-3 שעות מעכשיו.'); fetchOptions(); }
      else alert(result.message);
    } catch { alert('שגיאה בהקפצת הלקוח.'); }
  };

  if (loading) return <div className={styles.loading}>טוען נתונים...</div>;

  const filtered = options.filter(o =>
    o.clientAFullName?.includes(search) || o.clientAIdNumber?.includes(search)
  );

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>ניהול אופציות פעילות ⏳</h2>

      <input
        style={{ width: '100%', maxWidth: '400px', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '1rem', marginBottom: '20px', direction: 'rtl', outline: 'none' }}
        placeholder="חיפוש לפי שם או תעודת זהות..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <p className={styles.emptyMessage}>{search ? 'לא נמצאו תוצאות.' : 'אין כרגע תאריכים שממתינים באופציה.'}</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map((option) => {
            const dateObj = option.eventDate?.date ? new Date(option.eventDate.date) : null;
            const eventDateStr = dateObj ? dateObj.toLocaleDateString('he-IL') : '';
            const hebrewDateStr = getHebrewDateString(dateObj);
            const expiresAtStr = option.eventDate?.optionExpiresAt ? new Date(option.eventDate.optionExpiresAt).toLocaleString('he-IL') : 'לא מוגדר';

            return (
              <div key={option.id} className={styles.card} onClick={() => setSelectedOption(option)}>
                <div className={styles.cardContent}>
                  <div>
                    <h3 className={styles.eventDateText}>
                      תאריך אירוע: <strong>{eventDateStr}</strong> <span style={{ color: '#d97706', fontSize: '0.95rem' }}>({hebrewDateStr})</span>
                    </h3>
                    <p className={styles.clientText}>לקוח: {option.clientAFullName} | טלפון: {option.clientAPhone}</p>
                    <p className={styles.expiryText}>פג תוקף ב: {expiresAtStr}</p>
                  </div>
                  <div className={styles.actions} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setNotifyOption(option)}
                      className={`${styles.btn} ${styles.notifyBtn}`}
                    >
                      שלח הודעת עניין
                    </button>
                    <button onClick={() => handleBump(option.calendarDateId)} className={`${styles.btn} ${styles.bumpBtn}`}>
                      הקפץ לקוח ⏱️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedOption && (
        <OptionActionModal
          option={selectedOption}
          onClose={() => setSelectedOption(null)}
          onSuccess={() => { setSelectedOption(null); fetchOptions(); }}
        />
      )}

      {notifyOption && (
        <NotifyOptionModal
          booking={notifyOption}
          eventDateStr={
            notifyOption.eventDate?.date
              ? new Date(notifyOption.eventDate.date).toISOString().split('T')[0]
              : ''
          }
          onClose={() => setNotifyOption(null)}
        />
      )}
    </div>
  );
};

export default OptionsManager;
