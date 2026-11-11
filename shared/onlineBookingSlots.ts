export const ONLINE_BOOKING_SLOT_INTERVAL_MINUTES = 30;
export const ONLINE_BOOKING_OPEN_MINUTES = 8 * 60;
export const ONLINE_BOOKING_CLOSE_MINUTES = 17 * 60;

/**
 * The last time a dog comes in.
 *
 * Lauren, 10/11/2026: "first dogs 7:30, last booking come in at 1pm". The
 * staff side has offered nothing after 1pm since then, but online booking,
 * the portal's reschedule and membership plan placement kept offering
 * starts up to 3pm, because they ran off the 5pm close instead. Andy,
 * 12/11/2026, agreed they should match.
 *
 * Inclusive: 1pm itself is a booking. The 5pm close still applies on top,
 * so a long service can lose its later starts to that instead.
 *
 * The staff side's SALON_LAST_BOOKING_MINUTES is this same constant, so
 * the two cannot drift apart again.
 */
export const SALON_LAST_DROP_OFF_MINUTES = 13 * 60;

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

  const lastStart = Math.min(ONLINE_BOOKING_CLOSE_MINUTES - durationMinutes, SALON_LAST_DROP_OFF_MINUTES);
  const slots: Date[] = [];
  for (let minute = ONLINE_BOOKING_OPEN_MINUTES; minute <= lastStart; minute += ONLINE_BOOKING_SLOT_INTERVAL_MINUTES) {
    if (inSalonQuietWindow(minute)) continue;
    slots.push(new Date(aestMidnight + minute * 60_000));
  }
  return slots;
}

/**
 * Is this instant one of the starts the slot builder would offer?
 *
 * The booking endpoints take a start time from the browser, so without
 * this a request posted directly could still book 2pm, or 10am inside the
 * quiet window, even though no list ever showed it.
 */
export function isOfferedOnlineStart(scheduledStart: Date, durationMinutes: number): boolean {
  const t = scheduledStart.getTime();
  if (!Number.isFinite(t)) return false;
  const dateKey = scheduledStart.toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  return buildOnlineBookingSlotStarts(dateKey, durationMinutes).some((slot) => slot.getTime() === t);
}
