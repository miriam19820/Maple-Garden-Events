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
  bookings: any[];
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

export const Calendar = ({ onDateSelect }: CalendarProps) => {const getEventTitle = (booking: any) => {
  // 1. מנקים רווחים נסתרים מסוג האירוע כדי שהקוד יזהה אותו בוודאות
  const type = (booking.eventType || '').trim(); 

  // 2. פונקציית עזר בטוחה לחילוץ שם משפחה
  const getLastName = (fullName: string) => {
    if (!fullName) return '';
    return fullName.trim().split(' ').pop() || '';
  };

  const nameA = getLastName(booking.clientAFullName);
  const nameB = getLastName(booking.clientBFullName);

  // 3. חיבור חכם של השמות - רק אם יש באמת שני צדדים שונים
  let namesDisplay = '';
  if (nameA && nameB && nameA !== nameB) {
    namesDisplay = `${nameA}-${nameB}`;
  } else {
    // אם הוזן רק צד אחד במערכת, נציג רק אותו
    namesDisplay = nameA || nameB; 
  }

  // 4. תצוגה סופית על הלוח (בלי מקף מיותר בחתונות)
  if (type === 'חתונה' || type === 'אירוסין') {
    return `${type} ${namesDisplay}`;
  }
  
  return `${type} - משפחת ${namesDisplay}`;
};
 const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [datesData, setDatesData]     = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [selectedDateForAction, setSelectedDateForAction] = useState<string | null>(null);
  const [isOptionMode, setIsOptionMode] = useState(false);
  const [optionDates, setOptionDates] = useState<string[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState('חתונה'); 

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay  = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  const lastDay = new Date(year, month + 1, 0);
  const endDate = new Date(year, month + 1, 0 + (6 - lastDay.getDay()));

  const startStr = formatDateLocal(startDate);
  const endStr   = formatDateLocal(endDate);
  
  // שומרים את התאריך של היום כדי להשוות מול הלוח
  const todayStr = formatDateLocal(new Date());
     // הפונקציה ששאלת עליה - הדבקנו אותה כאן בתוך הקומפוננטה
 

  const fetchCalendarData = () => {
    setLoading(true);
    axios.get('http://localhost:5000/api/calendar/dates', { 
      params: { start: startStr, end: endStr, eventType: eventTypeFilter } 
    })
      .then(r => setDatesData(r.data))
      .catch(e => console.error('שגיאה:', e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCalendarData();
  }, [startStr, endStr, eventTypeFilter]);

  useEffect(() => {
    socket.on('date-updated', fetchCalendarData);
    return () => { socket.off('date-updated', fetchCalendarData); };
  }, [startStr, endStr, eventTypeFilter]);

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
        id: srv?.id ?? null, 
        date: key, 
        dayOfWeek: dow, 
        hebrewDate: srv?.hebrewDate ?? '',
        status: srv?.status ?? 'AVAILABLE', 
        reason: srv?.reason ?? null, 
        candleTime: srv?.candleTime ?? null,
        lockedBy: srv?.lockedBy ?? null, 
        bookings: srv?.bookings ?? [],
        isCurrentMonth: loop.getMonth() === month,
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
        <button className="side-mgmt-btn" onClick={() => navigate('/greeting')}>שליחת ברכה 💌</button>
        <button className="side-mgmt-btn" onClick={() => navigate('/event-form-manager')}>טופס הפקת אירוע</button>
      </div>

      <div className="calendar-container">
      
      <div style={{ padding: '10px 16px', background: '#fff', borderRadius: '8px', marginBottom: '16px', border: '1px solid #e2e8f0', display: 'flex', gap: '15px', alignItems: 'center', direction: 'rtl', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <strong style={{ color: '#1e293b' }}>בדוק זמינות עבור:</strong>
        <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', background: '#f8fafc', cursor: 'pointer', outline: 'none' }}>
          <option value="חתונה">חתונה</option>
          <option value="אירוע אחר">אירוע אחר</option>
        </select>
      </div>

      {isOptionMode && (
        <div className="option-mode-banner">
          <p>מצב בחירת אופציה: נבחרו {optionDates.length} מתוך 3 תאריכים.</p>
          <div className="option-banner-actions">
           <button 
              className="confirm-options-btn" 
              onClick={() => {
                navigate(`/option`, { state: { selectedDates: optionDates } });
                setIsOptionMode(false);
                setOptionDates([]);
              }} 
              disabled={optionDates.length === 0}
            >
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

      {loading ? <div className="calendar-loading">טוען נתונים...</div> : (
        <div className="calendar-grid-wrapper">
          <div className="calendar-grid">
            {COL_HEADERS.map((d, i) => <div key={d} className="week-day-label" style={{ gridColumn: i + 1, gridRow: 1 }}>{d}</div>)}
            {grid.map(day => {
              const isSelectedOption = optionDates.includes(day.date);
              
              // לוגיקה לזיהוי היום והעבר
              const isToday = day.date === todayStr;
              const isPast = day.date < todayStr;
              
              const cls = [
                'calendar-cell', 
                `status-${day.status.toLowerCase()}`, 
                !day.isCurrentMonth ? 'out-of-month' : '', 
                isSelectedOption ? 'selected-for-option' : '',
                isToday ? 'is-today' : '',
                isPast && day.isCurrentMonth ? 'is-past' : ''
              ].filter(Boolean).join(' ');
              
              const dayNum = new Date(day.date + 'T12:00:00').getDate();
              
              return (
                <div key={day.date} className={cls} style={{ gridColumn: day.col, gridRow: day.row }} onClick={() => {
                  if (!day.isCurrentMonth || day.status === 'BLOCKED' || day.status === 'FORBIDDEN' || isPast) return;
                  
                  if (day.bookings.length > 0) { setSelectedDay(day); return; }
                  
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

<div className="cell-events-container">
  {day.bookings.map((b: any, idx: number) => (
    <div 
      key={idx} 
      className={`small-event-pill ${day.status === 'BOOKED' ? 'event-booked' : 'event-option'}`}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedDay(day);
      }}
    >
      {/* כאן אנחנו קוראים לפונקציה החדשה */}
      {getEventTitle(b)}
    </div>
  ))}
</div>
                  </div>
              
              );
            })}
          </div>
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