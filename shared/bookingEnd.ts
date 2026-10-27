/**
 * When a booking finishes, which is not always ninety minutes later.
 *
 * Every appointment booked from a client's record was given a flat 90
 * minutes, whatever the service. For a groom that is roughly right. For
 * DAY CARE it is nonsense: a dog dropped at nine is not collected at
 * half ten, and the day care board reads its "Out" straight off this,
 * so the wall would have shown a collection time nobody agreed to.
 *
 * So day care carries a real pick-up time, chosen when the booking is
 * made. Everything else keeps the ninety minutes it already had —
 * changing grooming durations is a separate decision with a separate
 * set of numbers behind it (see shared/appointmentDuration.ts), and
 * quietly altering them while fixing day care would move bookings
 * nobody asked about.
 */

/** The flat duration every non-day-care booking has always used. */
export const DEFAULT_BOOKING_MINUTES = 90;

/**
 * The salon's usual day care pick-up, as a starting point.
 *
 * Four in the afternoon: late enough to cover a working day, and a
 * time staff can change rather than a guess dressed up as a rule.
 */
export const DEFAULT_DAYCARE_END = "16:00";

export type BookingEndInput = {
  /** When the dog arrives. */
  start: Date;
  serviceType: string;
  /** "HH:MM" on the same day. Only read for day care. */
  endTime?: string | null;
};

export function isDaycareService(serviceType: string | null | undefined): boolean {
  return String(serviceType ?? "").toLowerCase() === "daycare";
}

/**
 * The booking's end, or null when day care has been given a time that
 * cannot work.
 *
 * Null rather than a silent fallback: a pick-up time earlier than the
 * drop-off is a typo somebody needs to see, and quietly stretching it
 * to the next day would put a dog on tomorrow's board.
 */
export function resolveBookingEnd(input: BookingEndInput): Date | null {
  if (!isDaycareService(input.serviceType)) {
    return new Date(input.start.getTime() + DEFAULT_BOOKING_MINUTES * 60_000);
  }

  const time = String(input.endTime ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  // Built from the START's own calendar day, so a pick-up time is read
  // in the same timezone the drop-off was — not the browser's idea of
  // midnight, which is where this kind of code usually goes wrong.
  const end = new Date(input.start);
  end.setHours(hours, minutes, 0, 0);

  // Same day only. A dog is not collected before it arrives, and the
  // salon does not board overnight.
  return end.getTime() > input.start.getTime() ? end : null;
}
