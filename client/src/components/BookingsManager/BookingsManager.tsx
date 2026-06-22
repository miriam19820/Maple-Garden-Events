import React, { useEffect, useState } from 'react';
import styles from './BookingsManager.module.css';
import LiveAdditionForm from '../LiveAdditionForm/LiveAdditionForm';
import BookingDetailsModal from './BookingDetailsModal';
import { useBookingsQuery } from '../../hooks/queries';
import { PaginationBar } from '../PaginationBar/PaginationBar';

const BookingsManager = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [showAdditionForm, setShowAdditionForm] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, refetch } = useBookingsQuery({
    status: 'BOOKED',
    page,
    limit: 24,
    search: debouncedSearch || undefined,
  });

  const bookings = data?.data ?? [];
  const pagination = data?.pagination;

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
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <p className={styles.empty}>טוען...</p>
      ) : bookings.length === 0 ? (
        <p className={styles.empty}>{search ? 'לא נמצאו תוצאות.' : 'אין הזמנות סגורות.'}</p>
      ) : (
        <>
          <div className={styles.grid}>
            {bookings.map((b: any) => (
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
          {pagination && (
            <PaginationBar
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              onPageChange={setPage}
            />
          )}
        </>
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
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
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
                refetch();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingsManager;
