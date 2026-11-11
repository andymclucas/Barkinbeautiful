export const ONLINE_BOOKING_SLOT_INTERVAL_MINUTES = 30;
export const ONLINE_BOOKING_OPEN_MINUTES = 8 * 60;
export const ONLINE_BOOKING_CLOSE_MINUTES = 17 * 60;

/**
 * The mid-morning gap the salon keeps free of drop-offs.
 *
 * Lauren, 11/11/2026: "We try and block out after 9:30AM - then take more
 * dogs 11/11:30-1pm so the day is split - less customer interference and
 * having to do reception work bringing dogs in and also lets us complete
 * the morning dogs before lunch." Andy: "make next available respect the
 * 9:30–11 split", and then "Yes, everywhere" — online booking, the
 * client portal's reschedule and membership plan placement as well.
 *
 * Starts strictly AFTER 9:30 and strictly BEFORE 11:00 are not offered —
 * 9:30 and 11:00 themselves are — so on the half-hour grid 10:00 and
 * 10:30 drop out. An offer rule only: staff can
 * still type a 10am booking when they choose to.
 *
 * Hardcoded with the opening hours; a second salon would need these on
 * its own settings.
 */
export const SALON_QUIET_AFTER_MINUTES = 9 * 60 + 30;
export const SALON_QUIET_BEFORE_MINUTES = 11 * 60;

export function inSalonQuietWindow(startMinutes: number): boolean {
  return startMinutes > SALON_QUIET_AFTER_MINUTES && startMinutes < SALON_QUIET_BEFORE_MINUTES;
}

export function buildOnlineBookingSlotStarts(dateKey: string, durationMinutes: number): Date[] {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day || durationMinutes <= 0) return [];

  // Brisbane operates on AEST year-round. Midnight AEST is 14:00 UTC the day before.
  const aestMidnight = Date.UTC(year, month - 1, day - 1, 14, 0, 0, 0);

  // The salon is closed Saturday, Sunday and Monday \u2014 no online booking or
  // reschedule slots on those days. Compute the day-of-week directly from
  // the requested calendar date (not from aestMidnight, which is shifted
  // into the *previous* UTC day and would give the wrong weekday).
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 6) return [];

  const lastStart = ONLINE_BOOKING_CLOSE_MINUTES - durationMinutes;
  const slots: Date[] = [];
  for (let minute = ONLINE_BOOKING_OPEN_MINUTES; minute <= lastStart; minute += ONLINE_BOOKING_SLOT_INTERVAL_MINUTES) {
    if (inSalonQuietWindow(minute)) continue;
    slots.push(new Date(aestMidnight + minute * 60_000));
  }
  return slots;
}
