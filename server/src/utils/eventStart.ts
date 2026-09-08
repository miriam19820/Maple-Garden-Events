import { getSlotHours, normalizeTimeSlot } from './timeSlot';

export interface EventFormTime {
  eventTime?: string | null;
}

export interface BookingTime {
  timeOfDay?: string | null;
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseStoredTimeOfDay(stored: string | null | undefined) {
  if (!stored) return { timeOfDay: '', startTime: '', endTime: '' };
  const pipeParts = stored.split('|');
  const main = pipeParts[0]?.trim() || stored;
  const timePart = pipeParts[1]?.trim();
  const partOfDay = ['morning', 'noon', 'evening'];
  if (partOfDay.includes(main)) {
    if (timePart?.includes(' - ')) {
      const [start, end] = timePart.split(' - ');
      return { timeOfDay: main, startTime: start.trim(), endTime: end.trim() };
    }
    return { timeOfDay: main, startTime: '', endTime: '' };
  }
  if (stored.includes(' - ')) {
    const [start, end] = stored.split(' - ');
    const slot = normalizeTimeSlot(stored, start.trim());
    return { timeOfDay: slot || '', startTime: start.trim(), endTime: end.trim() };
  }
  return { timeOfDay: main, startTime: '', endTime: '' };
}

export function getSlotStartTimeString(booking: BookingTime): string {
  const parsed = parseStoredTimeOfDay(booking.timeOfDay);
  if (parsed.startTime) return parsed.startTime;

  const slot = normalizeTimeSlot(booking.timeOfDay, parsed.startTime);
  if (slot) return getSlotHours(slot).start;

  return '18:00';
}

export function getSlotEndTimeString(booking: BookingTime): string {
  const parsed = parseStoredTimeOfDay(booking.timeOfDay);
  if (parsed.endTime) return parsed.endTime;

  const slot = normalizeTimeSlot(booking.timeOfDay, parsed.startTime);
  if (slot) return getSlotHours(slot).end;

  return '00:00';
}

export function getEventStartTimeString(
  booking: BookingTime,
  eventForm?: EventFormTime | null
): string {
  if (eventForm?.eventTime?.trim()) return eventForm.eventTime.trim();
  return getSlotStartTimeString(booking);
}

export function getEventEndTimeString(
  booking: BookingTime,
  _eventForm?: EventFormTime | null
): string {
  return getSlotEndTimeString(booking);
}

function toMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function buildDateTime(eventDateStr: string, timeStr: string, addDays = 0): Date {
  const [year, month, day] = eventDateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day + addDays, hours || 0, minutes || 0, 0, 0);
}

/**
 * Overnight rule: an event whose end clock-time is at or before its start clock-time
 * ends on the FOLLOWING civil day.
 *
 *   18:00 → 00:00  ends next day 00:00   (default evening slot)
 *   19:00 → 01:00  ends next day 01:00   (was previously resolved to the SAME day 01:00)
 *   23:30 → 02:00  ends next day 02:00
 *   22:00 → 23:00  ends same day 23:00
 *   08:00 → 12:00  ends same day 12:00
 *
 * `endsNextDay` is exported so callers can reason about the span explicitly.
 */
export function endsNextDay(startTime: string, endTime: string): boolean {
  return toMinutes(endTime) <= toMinutes(startTime);
}

export function getSlotStartDateTime(eventDateStr: string, booking: BookingTime): Date {
  return buildDateTime(eventDateStr, getSlotStartTimeString(booking));
}

export function getSlotEndDateTime(eventDateStr: string, booking: BookingTime): Date {
  const start = getSlotStartTimeString(booking);
  const end = getSlotEndTimeString(booking);
  return buildDateTime(eventDateStr, end, endsNextDay(start, end) ? 1 : 0);
}

export function getEventStartDateTime(
  eventDateStr: string,
  booking: BookingTime,
  eventForm?: EventFormTime | null
): Date {
  return buildDateTime(eventDateStr, getEventStartTimeString(booking, eventForm));
}

/**
 * End instant of the event. The end clock-time always comes from the booking slot
 * (`timeOfDay`), so the overnight comparison uses the slot start — not
 * `eventForm.eventTime`, which only refines the *start* shown to staff.
 */
export function getEventEndDateTime(
  eventDateStr: string,
  booking: BookingTime,
  _eventForm?: EventFormTime | null
): Date {
  return getSlotEndDateTime(eventDateStr, booking);
}

export function isEventDay(eventDateStr: string, now: Date = new Date()): boolean {
  return eventDateStr === formatDateStr(now);
}

export function canViewCheckIn(
  eventDateStr: string,
  booking: BookingTime,
  _eventForm?: EventFormTime | null,
  now: Date = new Date()
): boolean {
  const today = formatDateStr(now);
  if (eventDateStr > today) return false;
  if (eventDateStr < today) return true;
  const start = getSlotStartDateTime(eventDateStr, booking);
  return now >= start;
}

export function canEditCheckIn(
  eventDateStr: string,
  booking: BookingTime,
  _eventForm?: EventFormTime | null,
  now: Date = new Date()
): boolean {
  if (!isEventDay(eventDateStr, now)) return false;
  const start = getSlotStartDateTime(eventDateStr, booking);
  const end = getSlotEndDateTime(eventDateStr, booking);
  return now >= start && now <= end;
}

export function isEventLive(
  eventDateStr: string,
  booking: BookingTime,
  eventForm?: EventFormTime | null,
  now: Date = new Date()
): boolean {
  return canEditCheckIn(eventDateStr, booking, eventForm, now);
}
