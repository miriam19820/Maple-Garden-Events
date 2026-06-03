import React from 'react';
import './EventPopup.css';

interface EventPopupProps {
  day: any;
  onClose: () => void;
}

export const EventPopup = ({ day, onClose }: EventPopupProps) => {
  const bookings = day.bookings || [];

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h2>פרטי אירועים - {day.date.split('-').reverse().join('/')}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="popup-body">
          {bookings.length === 0 ? (
            <p className="no-events-msg">אין אירועים בתאריך זה.</p>
          ) : (
            bookings.map((booking: any, index: number) => {
              // --- לוגיקת חוסרים חכמה ---
              const isWedding = booking.eventType === 'חתונה' || booking.eventType === 'אירוסין';
              const missingItems = [];
              
              if (!booking.paidAmount || booking.paidAmount === 0) missingItems.push('מקדמה טרם שולמה');
              if (!booking.isContractSigned) missingItems.push('חוזה טרם נחתם');
              if (!booking.clientAIdNumber) missingItems.push("חסרה ת.ז של צד א'");
              if (isWedding && !booking.clientBIdNumber) missingItems.push("חסרה ת.ז של צד ב'");
              if (!booking.guestCount || booking.guestCount === 0) missingItems.push('לא הוזנה כמות מוזמנים');

              return (
                <div key={booking.id || index} className="event-card">
                  <div className="event-card-header">
                    <h3>{booking.eventType} - {booking.timeOfDay || 'שעה לא צוינה'}</h3>
                    <span className={`status-badge ${booking.isOption ? 'option' : 'booked'}`}>
                      {booking.isOption ? 'אופציה שמורה' : 'סגור ונעול'}
                    </span>
                  </div>

                  <div className="event-card-grid">
                    {/* צד א' */}
                    <div className="info-group">
                      <h4>צד א'</h4>
                      <p><strong>שם:</strong> {booking.clientAFullName}</p>
                      <p><strong>טלפון:</strong> {booking.clientAPhone || 'לא הוזן'}</p>
                      <p><strong>ת.ז:</strong> {booking.clientAIdNumber || 'לא הוזן'}</p>
                      <p><strong>אימייל:</strong> {booking.clientAEmail || 'לא הוזן'}</p>
                    </div>

                    {/* צד ב' (רק אם יש, או אם זו חתונה) */}
                    {(booking.clientBFullName || isWedding) && (
                      <div className="info-group">
                        <h4>צד ב'</h4>
                        <p><strong>שם:</strong> {booking.clientBFullName || 'לא הוזן'}</p>
                        <p><strong>טלפון:</strong> {booking.clientBPhone || 'לא הוזן'}</p>
                        <p><strong>ת.ז:</strong> {booking.clientBIdNumber || 'לא הוזן'}</p>
                      </div>
                    )}

                    {/* פרטי העסקה */}
                    <div className="info-group">
                      <h4>פרטי העסקה</h4>
                      <p><strong>מוזמנים:</strong> {booking.guestCount || 'לא ידוע'}</p>
                      <p><strong>מחיר למנה:</strong> ₪{booking.finalPricePortion || 0}</p>
                      <p><strong>סה"כ לתשלום:</strong> ₪{booking.totalPrice || 0}</p>
                      <p><strong>שולם עד כה:</strong> ₪{booking.paidAmount || 0}</p>
                      <p><strong>נציג סוגר:</strong> {booking.createdBy || 'לא ידוע'}</p>
                    </div>

                    {/* חוסרים והערות */}
                    <div className={`info-group ${missingItems.length > 0 ? 'alerts-group' : 'all-good-group'}`}>
                      <h4>{missingItems.length > 0 ? 'סטטוס חוסרים' : 'סטטוס עסקה'}</h4>
                      
                      {missingItems.length > 0 ? (
                        <ul className="missing-list">
                          {missingItems.map((item, i) => <li key={i}>⚠️ {item}</li>)}
                        </ul>
                      ) : (
                        <p className="all-good">✅ העסקה מושלמת! לא חסר כלום.</p>
                      )}

                      {/* אם יש הערות מנהל או לקוח, נציג אותן */}
                      {booking.managerComments && (
                        <div className="comments-box">
                          <strong>הערות מנהל:</strong><br/>{booking.managerComments}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};