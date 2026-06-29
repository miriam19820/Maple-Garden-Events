import React, { useEffect, useMemo, useState } from 'react';
import styles from './BookingsManager.module.css';
import BookingDetailsModal from './BookingDetailsModal';
import { useBookingsQuery } from '../../hooks/queries';
import { PageLoader } from '../PageLoader/PageLoader';

const startOfDay = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const getEventDay = (b: any) => (b.eventDate?.date ? startOfDay(new Date(b.eventDate.date)) : null);

const BookingsManager = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useBookingsQuery({
    status: 'BOOKED',
    page: 1,
    limit: 500,
    search: debouncedSearch || undefined,
  });

  const { upcomingBookings, pastBookings } = useMemo(() => {
    const today = startOfDay(new Date());
    const bookings = (data?.data ?? []).filter((b: any) => !b.isOption);

    const upcoming = bookings
      .filter((b: any) => {
        const day = getEventDay(b);
        return day !== null && day >= today;
      })
      .sort((a: any, b: any) => getEventDay(a)!.getTime() - getEventDay(b)!.getTime());

    const past = bookings
      .filter((b: any) => {
        const day = getEventDay(b);
        return day !== null && day < today;
      })
      .sort((a: any, b: any) => getEventDay(b)!.getTime() - getEventDay(a)!.getTime());

    return { upcomingBookings: upcoming, pastBookings: past };
  }, [data]);

  const dateStr = (b: any) => b.eventDate?.date ? new Date(b.eventDate.date).toLocaleDateString('he-IL') : '';

  const closeSelected = () => setSelected(null);

  const renderBookingCard = (b: any) => (
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
  );

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
        <PageLoader />
      ) : upcomingBookings.length === 0 && pastBookings.length === 0 ? (
        <p className={styles.empty}>{search ? 'לא נמצאו תוצאות.' : 'אין הזמנות סגורות.'}</p>
      ) : (
        <>
          {upcomingBookings.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>אירועים קרובים ({upcomingBookings.length})</h3>
              <div className={styles.grid}>
                {upcomingBookings.map(renderBookingCard)}
              </div>
            </section>
          )}

          {pastBookings.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>אירועים שעברו ({pastBookings.length})</h3>
              <div className={styles.grid}>
                {pastBookings.map(renderBookingCard)}
              </div>
            </section>
          )}
        </>
      )}

      {selected && (
        <BookingDetailsModal
          booking={selected}
          onClose={closeSelected}
        />
      )}
    </div>
  );
};

export default BookingsManager;
