export type TimeSlot = 'morning' | 'noon' | 'evening';

export const TIME_SLOTS: TimeSlot[] = ['morning', 'noon', 'evening'];

export const SLOT_LABELS: Record<TimeSlot, string> = {
  morning: 'בוקר',
  noon: 'צהריים',
  evening: 'ערב',
};

const SLOT_ALIASES: Record<string, TimeSlot> = {
  morning: 'morning',
  noon: 'noon',
  evening: 'evening',
  בוקר: 'morning',
  צהריים: 'noon',
  ערב: 'evening',
};

/** מזהה משבצת זמן מתוך ערך שמור ב-DB */
export function normalizeTimeSlot(
  timeOfDay?: string | null,
  startTime?: string | null,
  endTime?: string | null
): TimeSlot | null {
  const raw = (timeOfDay || '').trim();
  if (!raw && !startTime) return null;

  const lower = raw.toLowerCase();
  if (SLOT_ALIASES[lower]) return SLOT_ALIASES[lower];
  if (SLOT_ALIASES[raw]) return SLOT_ALIASES[raw];

  const hourSource = startTime || raw.split(' - ')[0]?.trim();
  if (hourSource) {
    const hour = parseInt(hourSource.split(':')[0], 10);
    if (!isNaN(hour)) {
      if (hour < 12) return 'morning';
      if (hour < 17) return 'noon';
      return 'evening';
    }
  }

  return null;
}

export function getTakenSlots(bookings: { timeOfDay?: string | null }[]): Set<TimeSlot> {
  const taken = new Set<TimeSlot>();
  for (const b of bookings) {
    const slot = normalizeTimeSlot(b.timeOfDay);
    if (slot) taken.add(slot);
  }
  return taken;
}

export function getAvailableSlots(bookings: { timeOfDay?: string | null }[]): TimeSlot[] {
  const taken = getTakenSlots(bookings);
  return TIME_SLOTS.filter((s) => !taken.has(s));
}

export function formatStoredTimeOfDay(slot: TimeSlot, startTime?: string, endTime?: string): string {
  if (startTime && endTime) return `${slot}|${startTime} - ${endTime}`;
  return slot;
}
