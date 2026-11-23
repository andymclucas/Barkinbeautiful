/**
 * The clear time a CLIENT-made booking must leave around a groomer's other
 * bookings.
 *
 * Andy, 24/11/2026, on clients booking themselves from the portal: "It
 * needs to only be able to be booked based on groomers availability. Leave
 * 30 mins gap either side so there isn't any issues with double ups and
 * overlap."
 *
 * Applies to the paths a client drives with nobody watching the diary:
 * booking in the portal, moving a booking in the portal, and the public
 * /book page. Staff booking on the calendar is untouched; they can see the
 * day and back-to-back is their call.
 *
 * Stricter than the old per-groomer "dogs at once" limit on purpose: a
 * groomer allowed two dogs at a time still gets no client booking that
 * touches another of their bookings, because that limit is what let two
 * self-made bookings land on top of each other.
 */
export const CLIENT_BOOKING_BUFFER_MINUTES = 30;

export type BookedWindow = { scheduledStart: Date | string | number; scheduledEnd: Date | string | number };

/**
 * The bookings that come within the buffer of the requested time: any
 * whose own window, widened by the buffer either side, overlaps it. A
 * booking ending exactly 30 minutes before the requested start is clear;
 * one ending 29 minutes before is not.
 */
export function bookingsWithinBuffer<T extends BookedWindow>(
  bookings: readonly T[],
  requestedStart: Date,
  requestedEnd: Date,
  bufferMinutes: number = CLIENT_BOOKING_BUFFER_MINUTES,
): T[] {
  const pad = bufferMinutes * 60_000;
  const from = requestedStart.getTime();
  const to = requestedEnd.getTime();
  return bookings.filter((b) => {
    const start = new Date(b.scheduledStart).getTime() - pad;
    const end = new Date(b.scheduledEnd).getTime() + pad;
    return start < to && end > from;
  });
}

/** The same question as a yes/no: is this time clear of every booking? */
export function isClearOfBookings(
  bookings: readonly BookedWindow[],
  requestedStart: Date,
  requestedEnd: Date,
  bufferMinutes: number = CLIENT_BOOKING_BUFFER_MINUTES,
): boolean {
  return bookingsWithinBuffer(bookings, requestedStart, requestedEnd, bufferMinutes).length === 0;
}

/** The window a database query must cover to find every booking that could clash. */
export function bufferedSearchWindow(requestedStart: Date, requestedEnd: Date, bufferMinutes: number = CLIENT_BOOKING_BUFFER_MINUTES) {
  const pad = bufferMinutes * 60_000;
  return { from: new Date(requestedStart.getTime() - pad), to: new Date(requestedEnd.getTime() + pad) };
}
