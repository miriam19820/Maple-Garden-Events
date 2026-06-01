import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Calendar.css';
import { EventPopup } from '../EventPopup/EventPopup';
import { socket } from '../../services/socketService';

interface DayData {
  id: string | null;
  date: string;
  dayOfWeek: number;
  hebrewDate: string;
  status: string;
  reason: string | null;
  candleTime: string | null;
  lockedBy: string | null;
  booking: any | null;
  isCurrentMonth: boolean;
}

interface CalendarProps {
  onDateSelect: (day: DayData) => void;
}

const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const DOW_TO_COL: Record<number, number> = { 0:7, 1:6, 2:5, 3:4, 4:3, 5:2, 6:1 };
const COL_HEADERS = ['שבת','שישי','חמישי','רביעי','שלישי','שני','ראשון'];

const formatDateLocal = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const Calendar = ({ onDateSelect }: CalendarProps) => {
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [datesData, setDatesData]     = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [selectedDateForAction, setSelectedDateForAction] = useState<string | null>(null);
  const [isOptionMode, setIsOptionMode] = useState(false);
  const [optionDates, setOptionDates] = useState<string[]>([]);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay  = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  const lastDay = new Date(year, month + 1, 0);
  const endDate = new Date(year, month + 1, 0 + (6 - lastDay.getDay()));

  const startStr = formatDateLocal(startDate);
  const endStr   = formatDateLocal(endDate);

  // משיכת נתונים רגילה
  useEffect(() => {
    setLoading(true);
    axios.get('http://localhost:5000/api/calendar/dates', { params: { start: startStr, end: endStr } })
      .then(r => setDatesData(r.data))
      .catch(e => console.error('שגיאה:', e))
      .finally(() => setLoading(false));
  }, [startStr, endStr]);

  // האזנה לעדכוני זמן אמת מהשרת (Real-Time)
  useEffect(() => {
    const handleDateUpdate = (data: any) => {
      console.log('עדכון זמן אמת התקבל בלוח:', data);
      // מרעננים את הלוח בשקט (ללא מסך טעינה) כדי שהשינוי יקרה אוטומטית לעיני הלקוח
      axios.get('http://localhost:5000/api/calendar/dates', { params: { start: startStr, end: endStr } })
        .then(r => setDatesData(r.data))
        .catch(e => console.error('שגיאה ברענון זמן אמת:', e));
    };

    socket.on('date-updated', handleDateUpdate);

    // ניקוי ההאזנה כשהקומפוננטה נסגרת או כשמחליפים חודש
    return () => {
      socket.off('date-updated', handleDateUpdate);
    };
  }, [startStr, endStr]);

  const buildGrid = () => {
    const serverMap = new Map(datesData.map((d: any) => [d.date, d]));
    const days: (DayData & { col: number; row: number })[] = [];
    const loop = new Date(startDate);
    let row = 2;
    while (loop <= endDate) {
      const key = formatDateLocal(loop);
      const srv = serverMap.get(key);
      const dow = loop.getDay();
      days.push({
        id: srv?.id ?? null, date: key, dayOfWeek: dow, hebrewDate: srv?.hebrewDate ?? '',
        status: srv?.status ?? 'AVAILABLE', reason: srv?.reason ?? null, candleTime: srv?.candleTime ?? null,
        lockedBy: srv?.lockedBy ?? null, booking: srv?.booking ?? null, isCurrentMonth: loop.getMonth() === month,
        col: DOW_TO_COL[dow], row,
      });
      if (dow === 6) row++;
      loop.setDate(loop.getDate() + 1);
    }
    return days;
  };

  const grid = buildGrid();
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevYear  = () => setCurrentDate(new Date(year - 1, month, 1));
  const nextYear  = () => setCurrentDate(new Date(year + 1, month, 1));

  const handleBookEvent = () => {
    setIsActionModalOpen(false);
    const dayObj = grid.find(d => d.date === selectedDateForAction);
    if (dayObj) onDateSelect(dayObj);
  };

  return (
    <div className="calendar-page-layout">
      <div className="calendar-side-buttons">
        <button className="side-mgmt-btn" onClick={() => navigate('/options-manager')}>ניהול אופציות</button>
        <button className="side-mgmt-btn" onClick={() => navigate('/bookings-manager')}>ניהול הזמנות</button>
      </div>

      <div className="calendar-container">
      {isOptionMode && (
        <div className="option-mode-banner">
          <p>מצב בחירת אופציה: נבחרו {optionDates.length} מתוך 3 תאריכים.</p>
          <div className="option-banner-actions">
            <button className="confirm-options-btn" onClick={() => {
                navigate(`/booking`, { state: { selectedDates: optionDates, isOption: true } });
                setIsOptionMode(false);
                setOptionDates([]);
              }} disabled={optionDates.length === 0}>
              המשך להרשמה מלאה
            </button>
            <button className="cancel-btn" onClick={() => { setIsOptionMode(false); setOptionDates([]); }}>בטל</button>
          </div>
        </div>
      )}

      <div className="calendar-nav" style={{ direction: 'rtl' }}>
        <button className="nav-btn year-btn" onClick={nextYear}>»</button>
        <button className="nav-btn" onClick={nextMonth}>›</button>
        <div className="months-bar">
          {MONTH_NAMES.map((name, i) => (
            <div key={name} className={`month-tab ${i === month ? 'active' : ''}`} onClick={() => setCurrentDate(new Date(year, i, 1))}>{name}</div>
          ))}
        </div>
        <button className="nav-btn" onClick={prevMonth}>‹</button>
        <button className="nav-btn year-btn" onClick={prevYear}>«</button>
      </div>

      <div className="year-display">{year}</div>

      {loading ? <div className="calendar-loading">טוען...</div> : (
        <div className="calendar-grid">
          {COL_HEADERS.map((d, i) => <div key={d} className="week-day-label" style={{ gridColumn: i + 1, gridRow: 1 }}>{d}</div>)}
          {grid.map(day => {
            const isSelectedOption = optionDates.includes(day.date);
            const cls = ['calendar-cell', `status-${day.status.toLowerCase()}`, !day.isCurrentMonth ? 'out-of-month' : '', isSelectedOption ? 'selected-for-option' : ''].filter(Boolean).join(' ');
            const dayNum = new Date(day.date + 'T12:00:00').getDate();
            const isPast = new Date(day.date + 'T12:00:00') < new Date(new Date().toDateString());
            return (
              <div key={day.date} className={cls} style={{ gridColumn: day.col, gridRow: day.row, opacity: isPast && day.isCurrentMonth ? 0.5 : 1 }} onClick={() => {
                if (!day.isCurrentMonth || day.status === 'BLOCKED' || isPast) return;
                if (day.booking) { setSelectedDay(day); return; }
                if (isOptionMode) {
                  if (optionDates.includes(day.date)) setOptionDates(optionDates.filter(d => d !== day.date));
                  else if (optionDates.length < 3) setOptionDates([...optionDates, day.date]);
                  else alert("ניתן לבחור עד 3 תאריכים.");
                } else { setSelectedDateForAction(day.date); setIsActionModalOpen(true); }
              }}>
                <div className="cell-header-row">
                  <span className="gregorian-num">{dayNum}</span>
                  {day.isCurrentMonth && day.candleTime && <span className="candle-time">{day.candleTime}</span>}
                  <span className="hebrew-text">{day.isCurrentMonth ? day.hebrewDate : ''}</span>
                </div>
                <div className="cell-status-text">{day.isCurrentMonth ? (day.reason || '') : ''}</div>
                {day.isCurrentMonth && day.booking && (
                  <div className={`cell-event ${day.status === 'BOOKED' ? 'event-booked' : 'event-option'}`}>
                    <div className="event-name">{day.booking.clientAFullName}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedDay && <EventPopup day={selectedDay} onClose={() => setSelectedDay(null)} />}

      {isActionModalOpen && (
        <div className="side-panel-overlay" onClick={() => setIsActionModalOpen(false)}>
          <div className="side-panel" onClick={e => e.stopPropagation()}>
            <div className="side-panel-header">
              <span>תאריך: {selectedDateForAction?.split('-').reverse().join('-')}</span>
              <button className="side-panel-close" onClick={() => setIsActionModalOpen(false)}>✕</button>
            </div>
            <div className="side-panel-body">
              <button className="book-btn" onClick={handleBookEvent}>סגירת אירוע</button>
              <button className="option-btn" onClick={() => { setIsActionModalOpen(false); setIsOptionMode(true); setOptionDates([selectedDateForAction!]); }}>שמירת אופציה</button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};