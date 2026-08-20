export function isArchivedBooking(booking: {
  eventDate?: { status?: string | null } | null;
} | null | undefined): boolean {
  return booking?.eventDate?.status === 'ARCHIVED';
}
