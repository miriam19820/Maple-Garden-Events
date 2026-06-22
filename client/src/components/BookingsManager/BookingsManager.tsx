import React, { useState, useEffect, useCallback } from 'react';
import styles from './BookingsManager.module.css';
import LiveAdditionForm from '../LiveAdditionForm/LiveAdditionForm';
import BookingDetailsModal from './BookingDetailsModal';
import { apiFetch } from '../../services/api';

const BookingsManager = () => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [showAdditionForm, setShowAdditionForm] = useState(false);

  const fetchBookings = useCallback(() => {
    setLoading(true);
    apiFetch('http://localhost:5000/api/bookings')
      .then(r => r.json())
      .then(res => {
        if (res.success) setBookings(res.data.filter((b: any) => b.eventDate?.status === 'BOOKED'));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const filtered = bookings.filter(b =>
    b.clientAFullName?.includes(search) ||
    b.clientAIdNumber?.includes(search) ||
    b.clientBFullName?.includes(search) ||
    b.clientBIdNumber?.includes(search)
  );

  const dateStr = (b: any) => b.eventDate?.date ? new Date(b.eventDate.date).toLocaleDateString('he-IL') : '';

  const closeSelected = () => {
    setSelected(null);
    setShowAdditionForm(false); 
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
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
            <div key={b.id} className={styles.card}>
              <div className={styles.cardDate}>{dateStr(b)}</div>
              {b.eventCode && <div className={styles.cardCode}>#{b.eventCode}</div>}
              <div className={styles.cardName}>{b.clientAFullName}</div>
              {b.clientBFullName && <div className={styles.cardName}>{b.clientBFullName}</div>}
              <div className={styles.cardDetail}>סוג: {b.eventType} | {b.timeOfDay}</div>
              <div className={styles.cardDetail}>
                {b.eventType === 'השכרת אולם בלי אוכל' ? 'השכרת אולם (ללא מנות)' : `מוזמנים: ${b.guestCount}`}
              </div>
              <button
                type="button"
                className={styles.viewBtn}
                onClick={() => setSelected(b)}
              >
                הצגת כל פרטי ההזמנה
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && !showAdditionForm && (
        <BookingDetailsModal
          booking={selected}
          onClose={closeSelected}
          onAddAddition={() => setShowAdditionForm(true)}
        />
      )}

      {selected && showAdditionForm && (
        <div className={styles.popupOverlay} onClick={() => setShowAdditionForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowAdditionForm(false)}
              style={{ position: 'absolute', top: '10px', left: '10px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', zIndex: 10 }}
            >
              ✕
            </button>
            <LiveAdditionForm
              bookingId={selected.id}
              onSuccess={() => {
                setShowAdditionForm(false);
                closeSelected();
                alert('התוספת נרשמה בהצלחה והמחיר הכולל עודכן!');
                fetchBookings();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingsManager;