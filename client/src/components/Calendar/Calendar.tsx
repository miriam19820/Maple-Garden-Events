import React, { useEffect, useState, memo } from 'react';
import { useCalendarDatesQuery, prefetchCalendarDates } from '../../hooks/queries';
import { useNavigate } from 'react-router-dom';
import './Calendar.css';
import { EventPopup } from '../EventPopup/EventPopup';
import {
  getSlotColor,
  getTakenSlots,
  getBookableSlotsForDate,
  canAddMoreEventsForDate,
  hasOptionOnDay,
  normalizeTimeSlot,
  type TimeSlot,
} from '../../utils/timeSlot';
import { CalendarLegendBar } from './CalendarLegendBar';
import { CalendarDaySidePanel } from './CalendarDaySidePanel';
import { CalendarAgenda } from './CalendarAgenda';
import { OptionFormModal } from './OptionFormModal';
import { isEventLive } from '../../utils/eventStart';
import { useTranslation } from '../../i18n/useTranslation';
import { T as TranslationDict, type TranslationKey, type TranslationParams } from '@shared/i18n';
import { DEFAULT_EVENT_TYPE, translateByValue, EVENT_TYPE_KEY_BY_VALUE } from '@shared/i18n/bookingLookups';
import {
  type CalendarBookingApi,
  type CalendarDayApi,
} from '../../utils/optionDateApi';
import liveStyles from '../LiveEvent/LiveEvent.module.css';

interface DayData {
  id: string | null;
  date: string;
  dayOfWeek: number;
  hebrewDate: string;
  status: string;
  reason: string | null;
  candleTime: string | null;
  lockedBy: string | null;
  bookings: CalendarBookingApi[];
  blockedSlots?: string[];
  isCurrentMonth: boolean;
}

interface CalendarProps {
  onDateSelect: (day: DayData, filter: string) => void;
}

const DOW_TO_COL: Record<number, number> = { 0:7, 1:6, 2:5, 3:4, 4:3, 5:2, 6:1 };
const COL_HEADER_INDEX_KEYS = [0, 1, 2, 3, 4, 5, 6] as const;
const MINI_WEEKDAY_INDEX_KEYS = [6, 5, 4, 3, 2, 1, 0] as const;
const MAX_CELL_EVENTS = 3;

/** DOM order top→bottom so flex-end stacks: evening on top, morning at bottom */
const CALENDAR_SLOT_STACK_ORDER: TimeSlot[] = ['evening', 'noon', 'morning'];

function sortBookingsForCalendarCell(bookings: CalendarBookingApi[]) {
  return [...bookings].sort((a, b) => {
    const slotA = normalizeTimeSlot(a.timeOfDay) ?? 'morning';
    const slotB = normalizeTimeSlot(b.timeOfDay) ?? 'morning';
    return CALENDAR_SLOT_STACK_ORDER.indexOf(slotA) - CALENDAR_SLOT_STACK_ORDER.indexOf(slotB);
  });
}

const formatDateLocal = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const CalendarCell = memo(({ 
  day, 
  todayStr, 
  eventTypeFilter, 
  openDayPanel,
  t,
  T,
  getEventTitle 
}: {
  day: DayData & { col: number; row: number };
  todayStr: string;
  month: number;
  eventTypeFilter: string;
  openDayPanel: (day: DayData) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  T: typeof TranslationDict;
  getEventTitle: (booking: CalendarBookingApi) => string;
}) => {
  const isToday = day.date === todayStr;
  const isPast = day.date < todayStr;
  const dayNum = new Date(day.date + 'T12:00:00').getDate();
  const bookingCount = day.bookings?.length ?? 0;
  const isWeddingFilter = eventTypeFilter === DEFAULT_EVENT_TYPE;
  const hasRestrictionMarker =
    isWeddingFilter &&
    day.isCurrentMonth &&
    (day.status === 'FORBIDDEN' || day.status === 'PROBLEMATIC');
  const cls = [
    'calendar-cell',
    `status-${day.status.toLowerCase()}`,
    hasRestrictionMarker ? 'has-restriction-marker' : '',
    !day.isCurrentMonth ? 'out-of-month' : '',
    isToday ? 'is-today' : '',
    isPast && day.isCurrentMonth ? 'is-past' : '',
    isPast && day.isCurrentMonth && bookingCount > 0 ? 'is-past-has-events' : '',
  ].filter(Boolean).join(' ');
  const isHardBlocked = day.status === 'BLOCKED' && bookingCount === 0;
  const canViewPastEvents = isPast && bookingCount > 0;
  const isCellDisabled =
    !day.isCurrentMonth || day.status === 'FORBIDDEN' || isHardBlocked || (isPast && !canViewPastEvents);
  const ariaLabel = day.isCurrentMonth
    ? t(T.CALENDAR.CELL_ARIA, {
        day: dayNum,
        hebrewDate: day.hebrewDate || '',
        count: bookingCount,
        reason: day.reason || '',
        viewHint: canViewPastEvents ? t(T.CALENDAR.VIEW_CHECK_IN) : '',
      })
    : String(dayNum);

  return (
    <button
      type="button"
      className={cls}
      style={{ gridColumn: day.col, gridRow: day.row }}
      aria-label={ariaLabel}
      disabled={isCellDisabled}
      onClick={() => {
        if (!day.isCurrentMonth || day.status === 'FORBIDDEN' || isHardBlocked) return;
        if (isPast && bookingCount === 0) return;
        openDayPanel(day);
      }}
    >
      <div className="cell-header-row">
        <span className="gregorian-num">
          {dayNum}
          {isToday && <span className="today-badge">{t(T.CALENDAR.TODAY)}</span>}
        </span>
        {day.isCurrentMonth && day.candleTime && <span className="candle-time">{day.candleTime}</span>}
        <span className="hebrew-text">{day.isCurrentMonth ? day.hebrewDate : ''}</span>
      </div>

      {/* When events exist, prefer showing them over the period label (e.g. בין הזמנים). */}
      {day.isCurrentMonth && bookingCount === 0 && day.reason && (
        <div className="cell-status-text">{day.reason}</div>
      )}
      <div className={`cell-events-container${bookingCount > 0 ? ' has-events' : ''}`}>
        {sortBookingsForCalendarCell(day.bookings).slice(0, MAX_CELL_EVENTS).map((b, idx) => {
          const baseColor = getSlotColor(b.timeOfDay);
          const isOptionBooking = b.isOption === true;
          const isLive =
            !isOptionBooking &&
            day.status === 'BOOKED' &&
            isEventLive(day.date, b, b.eventForm);
          
          const eventStyle = isOptionBooking
            ? { 
                backgroundColor: `${baseColor}18`,
                border: `1.5px dashed ${baseColor}`,
                color: baseColor,
                fontWeight: '700'
              }
            : { 
                backgroundColor: baseColor,
                border: `1.5px solid ${baseColor}`,
                color: '#FFFFFF',
                fontWeight: '700',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
              };

          return (
            <div 
              key={idx} 
              className="small-event-pill"
              style={eventStyle}
              title={getEventTitle(b)}
              onClick={(e) => {
                e.stopPropagation();
                openDayPanel(day);
              }}
            >
              {isLive && <span className={liveStyles.liveBadge}>{t(T.CALENDAR.LIVE_BADGE)}</span>}
              {getEventTitle(b)}
            </div>
          );
        })}
        {bookingCount > MAX_CELL_EVENTS && (
          <button
            type="button"
            className="calendar-more-events"
            onClick={(e) => {
              e.stopPropagation();
              openDayPanel(day);
            }}
          >
            {t(T.CALENDAR.MORE_EVENTS, { count: bookingCount - MAX_CELL_EVENTS })}
          </button>
        )}
      </div>
    </button>
  );
}, (prevProps, nextProps) => {
  return prevProps.day === nextProps.day && 
         prevProps.todayStr === nextProps.todayStr &&
         prevProps.month === nextProps.month &&
         prevProps.eventTypeFilter === nextProps.eventTypeFilter;
});

export const Calendar = ({ onDateSelect }: CalendarProps) => {
  const { t, T } = useTranslation();
  const navigate = useNavigate();

  const getEventTitle = (booking: CalendarBookingApi) => {
  // 1. מנקים רווחים נסתרים מסוג האירוע כדי שהקוד יזהה אותו בוודאות
  const type = (booking.eventType || '').trim(); 

  // 2. פונקציית עזר בטוחה לחילוץ שם משפחה
  const getLastName = (fullName?: string) => {
    if (!fullName) return '';
    return fullName.trim().split(' ').pop() || '';
  };

  const nameA = getLastName(booking.clientAFullName);
  const nameB = getLastName(booking.clientBFullName);

  // 3. חיבור חכם של השמות - רק אם יש באמת שני צדדים שונים
  const namesDisplay =
    nameA && nameB && nameA !== nameB
      ? `${nameA}-${nameB}`
      : nameA || nameB;

  // 4. תצוגה סופית על הלוח (בלי מקף מיותר בחתונות)
  if (type === 'חתונה' || type === 'אירוסין') {
    return `${translateByValue(t, EVENT_TYPE_KEY_BY_VALUE, type)} ${namesDisplay}`;
  }

  return t(T.CALENDAR.EVENT_LABEL_FAMILY, {
    type: translateByValue(t, EVENT_TYPE_KEY_BY_VALUE, type),
    namesDisplay,
  });
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [sidePanelDay, setSidePanelDay] = useState<DayData | null>(null);
  const [eventPopupDay, setEventPopupDay] = useState<DayData | null>(null);
  const [optionModalDay, setOptionModalDay] = useState<DayData | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState(DEFAULT_EVENT_TYPE);
  const [selectedDate, setSelectedDate] = useState(() => formatDateLocal(new Date()));
  const [, setLiveTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setLiveTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay  = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  const lastDay = new Date(year, month + 1, 0);
  const endDate = new Date(year, month + 1, 0 + (6 - lastDay.getDay()));

  const startStr = formatDateLocal(startDate);
  const endStr   = formatDateLocal(endDate);

  const todayStr = formatDateLocal(new Date());

  const { data: datesData = [], isLoading: loading, isError } = useCalendarDatesQuery(startStr, endStr, eventTypeFilter);
  const datesList = Array.isArray(datesData) ? datesData : [];

  const buildGrid = () => {
    const serverMap = new Map<string, CalendarDayApi>(datesList.map((d) => [d.date, d]));
    const days: (DayData & { col: number; row: number })[] = [];
    const loop = new Date(startDate);
    let row = 1;
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
        blockedSlots: srv?.blockedSlots ?? [],
        isCurrentMonth: loop.getMonth() === month,
        col: DOW_TO_COL[dow], row,
      });
      if (dow === 6) row++;
      loop.setDate(loop.getDate() + 1);
    }
    return days;
  };

  const grid = buildGrid();
  const weekRowCount = grid.length > 0 ? Math.max(...grid.map((d) => d.row)) : 5;
  const selectedDay =
    grid.find((day) => day.isCurrentMonth && day.date === selectedDate) ??
    grid.find((day) => day.isCurrentMonth && day.date === todayStr) ??
    grid.find((day) => day.isCurrentMonth) ??
    null;

  const goToMonth = (y: number, m: number) => {
    setCurrentDate(new Date(y, m, 1));
    const today = new Date();
    if (today.getFullYear() === y && today.getMonth() === m) {
      setSelectedDate(formatDateLocal(today));
    } else {
      setSelectedDate(formatDateLocal(new Date(y, m, 1)));
    }
  };

  const prevMonth = () => goToMonth(year, month - 1);
  const nextMonth = () => goToMonth(year, month + 1);
  const prevYear  = () => goToMonth(year - 1, month);
  const nextYear  = () => goToMonth(year + 1, month);

  const prefetchForDate = (y: number, m: number) => {
    const pFirst = new Date(y, m, 1);
    const pStart = new Date(y, m, 1 - pFirst.getDay());
    const pLast = new Date(y, m + 1, 0);
    const pEnd = new Date(y, m + 1, 0 + (6 - pLast.getDay()));
    prefetchCalendarDates(formatDateLocal(pStart), formatDateLocal(pEnd), eventTypeFilter);
  };

  const handleBookEventFromPanel = () => {
    if (!sidePanelDay) return;
    const dayToBook = sidePanelDay;
    setSidePanelDay(null);
    onDateSelect(dayToBook, eventTypeFilter);
  };

  const handleOpenOptionFromPanel = () => {
    if (!sidePanelDay) return;
    setOptionModalDay(sidePanelDay);
  };

  const openDayPanel = (day: DayData) => {
    setSelectedDate(day.date);
    setSidePanelDay(day);
  };

  const handleHybridNewEvent = () => {
    if (!selectedDay) return;
    const bookingCount = selectedDay.bookings?.length ?? 0;
    const isPast = selectedDay.date < todayStr;
    const isHardBlocked = selectedDay.status === 'BLOCKED' && bookingCount === 0;
    const canCreate =
      !isPast &&
      selectedDay.status !== 'FORBIDDEN' &&
      !isHardBlocked &&
      canAddMoreEventsForDate(selectedDay.date, selectedDay.bookings || []);
    if (canCreate) openDayPanel(selectedDay);
  };

  const handleOverrideOptionBook = (day: DayData) => {
    if (!day.id) {
      alert(t(T.CALENDAR.RELEASE_OPTION_ERROR));
      return;
    }
    const optionBooking = day.bookings?.find((b: { isOption?: boolean }) => b.isOption) || day.bookings?.[0];
    const clientName = optionBooking?.clientAFullName || t(T.UI.CLIENT_FALLBACK);
    const isShabbat = new Date(`${day.date}T12:00:00`).getDay() === 6;
    const bookable = getBookableSlotsForDate(day.date, day.bookings || []);
    const shabbatNote = isShabbat && bookable.length === 0
      ? `\n\n${t(T.CALENDAR.SHABBAT_EVENING_NOTE)}`
      : '';
    const confirmed = window.confirm(
      t(T.CALENDAR.RELEASE_OPTION_CONFIRM, { clientName, shabbatNote }),
    );
    if (!confirmed) return;

    const optionSlots = Array.from(getTakenSlots(day.bookings || []));
    navigate('/booking', {
      state: {
        date: day.date,
        hebrewDate: day.hebrewDate,
        blockedSlots: (day.blockedSlots || []) as TimeSlot[],
        takenSlots: optionSlots,
        overrideOptionDateId: day.id,
        overrideOptionSlots: optionSlots,
        overrideOptionClientName: clientName,
      },
    });
  };

  return (
    <div className="calendar-page-layout">
      <div className="calendar-container">
      
      <div className="calendar-top-card">
        <div className="calendar-control-bar">
          <div className="calendar-availability-group">
            <span className="calendar-toolbar-label">{t(T.CALENDAR.AVAILABILITY_LABEL)}</span>
            <select
              className="calendar-toolbar-select"
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
            >
              <option value="חתונה">{t(T.CALENDAR.FILTER_WEDDING)}</option>
              <option value="אירוע אחר">{t(T.CALENDAR.FILTER_OTHER)}</option>
            </select>
          </div>

          <div className="calendar-inline-nav">
            <div className="inline-date-nav">
              <button
                type="button"
                className="inline-nav-btn"
                onClick={prevMonth}
                onMouseEnter={() => prefetchForDate(year, month - 1)}
                aria-label={t(T.CALENDAR.PREV_MONTH)}
              >
                ‹
              </button>
              <span className="inline-date-label">
                {t(T.CALENDAR.MONTHS[month as keyof typeof T.CALENDAR.MONTHS])}
              </span>
              <button
                type="button"
                className="inline-nav-btn"
                onClick={nextMonth}
                onMouseEnter={() => prefetchForDate(year, month + 1)}
                aria-label={t(T.CALENDAR.NEXT_MONTH)}
              >
                ›
              </button>
              <button
                type="button"
                className="inline-nav-btn"
                onClick={prevYear}
                onMouseEnter={() => prefetchForDate(year - 1, month)}
                aria-label={t(T.CALENDAR.PREV_YEAR)}
              >
                ‹
              </button>
              <span className="inline-date-label">{year}</span>
              <button
                type="button"
                className="inline-nav-btn"
                onClick={nextYear}
                onMouseEnter={() => prefetchForDate(year + 1, month)}
                aria-label={t(T.CALENDAR.NEXT_YEAR)}
              >
                ›
              </button>
            </div>
          </div>

          <div className="calendar-legend-slot">
            <CalendarLegendBar showWeddingRestrictions={eventTypeFilter === DEFAULT_EVENT_TYPE} />
          </div>
        </div>
      </div>

      {loading ? <div className="calendar-loading">{t(T.UI.LOADING_DATA)}</div> : isError ? (
        <div className="calendar-loading">{t(T.CALENDAR.LOAD_ERROR)}</div>
      ) : (
        <>
        <div className="calendar-hybrid">
          <div className="calendar-mini">
            <div className="calendar-mini-weekdays">
              {MINI_WEEKDAY_INDEX_KEYS.map((idx) => (
                <div key={idx} className="calendar-mini-weekday">
                  {t(T.CALENDAR.WEEKDAYS_SHORT[idx])}
                </div>
              ))}
            </div>
            <div
              className="calendar-mini-grid"
              style={{ ['--calendar-week-rows' as string]: weekRowCount } as React.CSSProperties}
            >
              {grid.map((day) => {
                const dayNum = new Date(`${day.date}T12:00:00`).getDate();
                const bookingCount = day.bookings?.length ?? 0;
                const isSelected = selectedDay?.date === day.date;
                const isToday = day.date === todayStr;
                const dots = sortBookingsForCalendarCell(day.bookings).slice(0, 3);
                const isWeddingFilter = eventTypeFilter === DEFAULT_EVENT_TYPE;
                const restrictionDot =
                  day.isCurrentMonth && isWeddingFilter && bookingCount === 0
                    ? day.status === 'FORBIDDEN'
                      ? 'is-forbidden'
                      : day.status === 'PROBLEMATIC'
                        ? 'is-partial'
                        : ''
                    : '';
                const className = [
                  'calendar-mini-day',
                  !day.isCurrentMonth ? 'is-outside' : '',
                  isToday ? 'is-today' : '',
                  isSelected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <button
                    key={day.date}
                    type="button"
                    className={className}
                    style={{ gridColumn: day.col, gridRow: day.row }}
                    disabled={!day.isCurrentMonth}
                    aria-pressed={isSelected}
                    aria-label={String(dayNum)}
                    onClick={() => {
                      if (!day.isCurrentMonth) return;
                      setSelectedDate(day.date);
                    }}
                  >
                    <span className="calendar-mini-num">{dayNum}</span>
                    <span className="calendar-mini-dots" aria-hidden="true">
                      {day.isCurrentMonth &&
                        dots.map((booking, idx) => (
                          <span
                            key={booking.id || idx}
                            className="calendar-mini-dot"
                            style={{ background: getSlotColor(booking.timeOfDay) }}
                          />
                        ))}
                      {restrictionDot && (
                        <span className={`calendar-mini-dot ${restrictionDot}`} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <CalendarAgenda
            day={selectedDay}
            todayStr={todayStr}
            getEventTitle={getEventTitle}
            onOpenDay={openDayPanel}
            onNewEvent={handleHybridNewEvent}
            canCreateEvent={Boolean(
              selectedDay &&
              selectedDay.date >= todayStr &&
              selectedDay.status !== 'FORBIDDEN' &&
              !(selectedDay.status === 'BLOCKED' && (selectedDay.bookings?.length ?? 0) === 0) &&
              canAddMoreEventsForDate(selectedDay.date, selectedDay.bookings || []),
            )}
          />
        </div>
        <div className="calendar-grid-wrapper">
          <div className="calendar-weekdays-bar">
            {COL_HEADER_INDEX_KEYS.map((idx) => (
              <div key={idx} className="week-day-label">{t(T.CALENDAR.COL_HEADERS[idx])}</div>
            ))}
          </div>
          <div
            className="calendar-grid calendar-grid-uniform"
            style={{ ['--calendar-week-rows' as string]: weekRowCount } as React.CSSProperties}
          >
            {grid.map(day => {
              return (
                <CalendarCell
                  key={day.date}
                  day={day}
                  todayStr={todayStr}
                  month={month}
                  eventTypeFilter={eventTypeFilter}
                  openDayPanel={openDayPanel}
                  t={t}
                  T={T}
                  getEventTitle={getEventTitle}
                />
              );
            })}
          </div>
        </div>
        </>
      )}
      {sidePanelDay && (
        <CalendarDaySidePanel
          day={sidePanelDay}
          onClose={() => setSidePanelDay(null)}
          onBookEvent={handleBookEventFromPanel}
          onOpenOption={handleOpenOptionFromPanel}
          onViewEvents={
            (sidePanelDay.bookings?.length ?? 0) > 0
              ? () => {
                  setEventPopupDay(sidePanelDay);
                  setSidePanelDay(null);
                }
              : undefined
          }
        />
      )}

      {eventPopupDay && (
        <EventPopup
          day={eventPopupDay}
          onClose={() => setEventPopupDay(null)}
          onAddEvent={() => {
            const dayToBook = eventPopupDay;
            setEventPopupDay(null);
            onDateSelect(dayToBook, eventTypeFilter);
          }}
          onAddOption={() => {
            setOptionModalDay(eventPopupDay);
            setEventPopupDay(null);
          }}
          onOverrideOptionBook={
            hasOptionOnDay(eventPopupDay)
              ? () => handleOverrideOptionBook(eventPopupDay)
              : undefined
          }
        />
      )}

      {optionModalDay && (
        <OptionFormModal
          date={optionModalDay.date}
          hebrewDate={optionModalDay.hebrewDate || ''}
          onClose={() => setOptionModalDay(null)}
        />
      )}
      </div>
    </div>
  );
};