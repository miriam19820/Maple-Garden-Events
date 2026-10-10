import fs from 'fs';
import path from 'path';

/**
 * Regression guard: closing/creating a booking used to return before Redis
 * calendar cache was cleared, so the board kept serving the previous month.
 */
const src = fs.readFileSync(
  path.join(__dirname, '../src/Services/booking/bookingLifecycle.service.ts'),
  'utf8',
);

function blockBetween(startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`Could not find markers:\n${startMarker}\n---\n${endMarker}`);
  }
  return src.slice(start, end);
}

function expectCalendarInvalidated(block: string) {
  expect(block).toContain("await invalidateCache('calendar')");
}

describe('bookingLifecycle calendar cache invalidation', () => {
  it('clears calendar cache when creating a booking or option', () => {
    expectCalendarInvalidated(
      blockBetween(
        'eventsToEmit.forEach(ev => emitDateUpdated(ev));',
        "message: newStatus === 'OPTION'",
      ),
    );
  });

  it('clears calendar cache before returning from option-to-event close', () => {
    const block = blockBetween(
      "if (isConverting) {\n    emitDateUpdated({ dateId: booking.eventDate.id, status: 'BOOKED' });",
      "message: 'האירוע נסגר ונשמר בהצלחה!'",
    );
    expectCalendarInvalidated(block);
    expect(block).toContain('emitBookingUpdated(updated.id)');
  });

  it('clears calendar cache when updating an existing booking', () => {
    expectCalendarInvalidated(
      blockBetween(
        "emitDateUpdated({ dateId: booking.eventDate.id, status: booking.eventDate.status });",
        "message: 'ההזמנה עודכנה בהצלחה.'",
      ),
    );
  });

  it('clears calendar cache when finalizing a signed booking', () => {
    expectCalendarInvalidated(
      blockBetween(
        "emitDateUpdated({ dateId: booking.eventDate.id, status: 'BOOKED' });\n  emitBookingUpdated(bookingId);",
        "message: 'האירוע נסגר והחוזה נחתם בהצלחה!'",
      ),
    );
  });
});
