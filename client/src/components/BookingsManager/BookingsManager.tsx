import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './BookingsManager.module.css';

const BookingsManager = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    fetch('http://localhost:5000/api/bookings')
      .then(r => r.json())
      .then(res => {
        if (res.success) setBookings(res.data.filter((b: any) => b.eventDate?.status === 'BOOKED'));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = bookings.filter(b =>
    b.clientAFullName?.includes(search) ||
    b.clientAIdNumber?.includes(search) ||
    b.clientBFullName?.includes(search) ||
    b.clientBIdNumber?.includes(search)
  );

  const dateStr = (b: any) => b.eventDate?.date ? new Date(b.eventDate.date).toLocaleDateString('he-IL') : '';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/')} className={styles.backBtn}>← חזרה ללוח</button>
        <h2 className={styles.title}>ניהול הזמנות</h2>
      </div>

      <input
        className={styles.searchInput}
        placeholder="חיפוש לפי שם או תעודת זהות..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <p className={styles.empty}>טוען...</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>{search ? 'לא נמצאו תוצאות.' : 'אין הזמנות סגורות.'}</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map(b => (
            <div key={b.id} className={styles.card} onClick={() => setSelected(b)}>
              <div className={styles.cardDate}>{dateStr(b)}</div>
              <div className={styles.cardName}>{b.clientAFullName}</div>
              {b.clientBFullName && <div className={styles.cardName}>{b.clientBFullName}</div>}
              <div className={styles.cardDetail}>סוג: {b.eventType} | {b.timeOfDay}</div>
              <div className={styles.cardDetail}>מוזמנים: {b.guestCount}</div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className={styles.popupOverlay} onClick={() => setSelected(null)}>
          <div className={styles.popupBox} onClick={e => e.stopPropagation()}>
            <div className={styles.popupHeader}>
              <span>פרטי הזמנה - {dateStr(selected)}</span>
              <button className={styles.popupClose} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className={styles.popupBody}>
              <div className={styles.popupRow}><label>סוג אירוע:</label><span>{selected.eventType}</span></div>
              <div className={styles.popupRow}><label>מועד:</label><span>{selected.timeOfDay}</span></div>
              <div className={styles.popupRow}><label>מוזמנים:</label><span>{selected.guestCount}</span></div>
              <div className={styles.popupRow}><label>מחיר מנה:</label><span>₪{selected.finalPricePortion}</span></div>
              <div className={styles.popupRow}><label>סה"כ:</label><span>₪{selected.totalPrice?.toLocaleString()}</span></div>
              <div className={styles.popupRow}><label>שולם:</label><span>₪{selected.paidAmount?.toLocaleString()}</span></div>
              <div className={styles.popupRow}><label>צד א' - שם:</label><span>{selected.clientAFullName}</span></div>
              <div className={styles.popupRow}><label>ת.ז:</label><span>{selected.clientAIdNumber}</span></div>
              <div className={styles.popupRow}><label>טלפון:</label><span>{selected.clientAPhone}</span></div>
              {selected.clientAPhone2 && <div className={styles.popupRow}><label>טלפון 2:</label><span>{selected.clientAPhone2}</span></div>}
              <div className={styles.popupRow}><label>עיר:</label><span>{selected.clientACity}</span></div>
              {selected.clientBFullName && <>
                <div className={styles.popupRow}><label>צד ב' - שם:</label><span>{selected.clientBFullName}</span></div>
                <div className={styles.popupRow}><label>ת.ז:</label><span>{selected.clientBIdNumber}</span></div>
                <div className={styles.popupRow}><label>טלפון:</label><span>{selected.clientBPhone}</span></div>
                {selected.clientBPhone2 && <div className={styles.popupRow}><label>טלפון 2:</label><span>{selected.clientBPhone2}</span></div>}
                <div className={styles.popupRow}><label>עיר:</label><span>{selected.clientBCity}</span></div>
              </>}
              {selected.managerComments && <div className={styles.popupRow}><label>הערות:</label><span>{selected.managerComments}</span></div>}
              <div className={styles.popupRow}><label>נסגר ע"י:</label><span>{selected.createdBy}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingsManager;
