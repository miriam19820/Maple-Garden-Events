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

export function normalizeTimeSlot(
  timeOfDay?: string | null,
  startTime?: string | null
): TimeSlot | null {
  const raw = (timeOfDay || '').trim();
  if (!raw && !startTime) return null;

  const slotPart = raw.includes('|') ? raw.split('|')[0]?.trim() : raw;
  const lower = slotPart.toLowerCase();
  if (SLOT_ALIASES[lower]) return SLOT_ALIASES[lower];
  if (SLOT_ALIASES[slotPart]) return SLOT_ALIASES[slotPart];

  const timePart = raw.includes('|') ? raw.split('|')[1]?.trim() : raw;
  const hourSource = startTime || timePart?.split(' - ')[0]?.trim();
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

export function canAddMoreEvents(bookings: { timeOfDay?: string | null }[]): boolean {
  return bookings.length < 3 && getAvailableSlots(bookings).length > 0;
}

export function formatAvailableSlotsLabel(bookings: { timeOfDay?: string | null }[]): string {
  return getAvailableSlots(bookings).map((s) => `${SLOT_LABELS[s]} פנוי`).join(' · ');
}

export function formatTimeOfDayDisplay(value: string | null | undefined): string {
  if (!value) return 'שעה לא צוינה';
  const slot = normalizeTimeSlot(value);
  if (slot) {
    const extra = value.includes('|') ? value.split('|')[1]?.trim() : value.includes(' - ') ? value : '';
    const label = SLOT_LABELS[slot];
    if (extra && extra !== slot && extra.includes(' - ')) return `${label} (${extra})`;
    return label;
  }
  return value;
}
