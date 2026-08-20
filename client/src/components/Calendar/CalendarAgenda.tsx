import { useTranslation } from '../../i18n/useTranslation';
import { T as TranslationDict } from '@shared/i18n';
import { isEventLive } from '../../utils/eventStart';
import {
  formatSlotLabel,
  getSlotColor,
  getSlotHours,
  normalizeTimeSlot,
  type TimeSlot,
} from '../../utils/timeSlot';
import type { CalendarBookingApi } from '../../utils/optionDateApi';
import liveStyles from '../LiveEvent/LiveEvent.module.css';

export interface AgendaDay {
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

interface CalendarAgendaProps {
  day: AgendaDay | null;
  todayStr: string;
  getEventTitle: (booking: CalendarBookingApi) => string;
  onOpenDay: (day: AgendaDay) => void;
  onNewEvent: () => void;
  canCreateEvent: boolean;
}

const SLOT_STACK: TimeSlot[] = ['evening', 'noon', 'morning'];
const DOW_DAY_KEYS = [
  TranslationDict.CALENDAR.DAYS.SUN,
  TranslationDict.CALENDAR.DAYS.MON,
  TranslationDict.CALENDAR.DAYS.TUE,
  TranslationDict.CALENDAR.DAYS.WED,
  TranslationDict.CALENDAR.DAYS.THU,
  TranslationDict.CALENDAR.DAYS.FRI,
  TranslationDict.CALENDAR.DAYS.SAT,
] as const;

function sortBookings(bookings: CalendarBookingApi[]) {
  return [...bookings].sort((a, b) => {
    const slotA = normalizeTimeSlot(a.timeOfDay) ?? 'morning';
    const slotB = normalizeTimeSlot(b.timeOfDay) ?? 'morning';
    return SLOT_STACK.indexOf(slotA) - SLOT_STACK.indexOf(slotB);
  });
}

function formatBookingTime(
  booking: CalendarBookingApi,
  t: (key: import('@shared/i18n').TranslationKey, params?: import('@shared/i18n').TranslationParams) => string,
) {
  const slot = normalizeTimeSlot(booking.timeOfDay);
  if (!slot) return '';
  const hours = getSlotHours(slot);
  return `${formatSlotLabel(t, slot)} · ${hours.start}–${hours.end}`;
}

export function CalendarAgenda({
  day,
  todayStr,
  getEventTitle,
  onOpenDay,
  onNewEvent,
  canCreateEvent,
}: CalendarAgendaProps) {
  const { t, T } = useTranslation();
  const bookings = day ? sortBookings(day.bookings ?? []) : [];
  const isPast = Boolean(day && day.date < todayStr);
  const dateHeading = day
    ? t(T.CALENDAR.AGENDA_DATE_HEADING, {
        weekday: t(DOW_DAY_KEYS[day.dayOfWeek]),
        hebrewDate: day.hebrewDate,
      })
    : '';

  return (
    <section className="calendar-agenda" aria-label={t(T.CALENDAR.AGENDA_TITLE)}>
      <div className="calendar-agenda-toolbar">
        <h2 className="calendar-agenda-title">{t(T.CALENDAR.AGENDA_TITLE)}</h2>
        {dateHeading && (
          <p className="calendar-agenda-subtitle">{dateHeading}</p>
        )}
      </div>

      <div className="calendar-agenda-list">
        {!day && <p className="calendar-agenda-empty">{t(T.CALENDAR.NO_EVENTS)}</p>}

        {day && bookings.length === 0 && (
          <div className="calendar-agenda-card is-empty">
            {day.reason ? (
              <p className="calendar-agenda-reason">{day.reason}</p>
            ) : (
              <p className="calendar-agenda-empty">{t(T.CALENDAR.NO_EVENTS)}</p>
            )}
          </div>
        )}

        {day &&
          bookings.map((booking, idx) => {
            const title = getEventTitle(booking);
            const isOption = booking.isOption === true;
            const isLive =
              !isOption &&
              day.status === 'BOOKED' &&
              isEventLive(day.date, booking, booking.eventForm);
            const timeLabel = formatBookingTime(booking, t);
            const statusLabel = isOption
              ? t(T.STATUS.OPTION)
              : isPast
                ? t(T.STATUS.PAST)
                : t(T.STATUS.CONFIRMED);
            const accent = getSlotColor(booking.timeOfDay);

            return (
              <button
                key={booking.id || idx}
                type="button"
                className="calendar-agenda-event-card"
                onClick={() => onOpenDay(day)}
              >
                <span className="calendar-agenda-event-accent" style={{ background: accent }} />
                <div className="calendar-agenda-event-body">
                  <div className="calendar-agenda-event-top">
                    <span className="calendar-agenda-event-name">{title}</span>
                    {isLive && <span className={liveStyles.liveBadge}>{t(T.CALENDAR.LIVE_BADGE)}</span>}
                  </div>
                  {day.hebrewDate && (
                    <p className="calendar-agenda-event-meta">{day.hebrewDate}</p>
                  )}
                  <div className="calendar-agenda-event-row">
                    <span className={`calendar-agenda-status${isOption ? ' is-option' : ''}`}>
                      {statusLabel}
                    </span>
                    {timeLabel && <span className="calendar-agenda-event-time">{timeLabel}</span>}
                  </div>
                </div>
              </button>
            );
          })}
      </div>

      <div className="calendar-agenda-footer">
        <button
          type="button"
          className="calendar-agenda-new-event"
          onClick={onNewEvent}
          disabled={!canCreateEvent}
        >
          {t(T.CALENDAR.NEW_EVENT)}
        </button>
      </div>
    </section>
  );
}
