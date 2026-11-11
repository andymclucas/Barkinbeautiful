/**
 * Half-hour slots for the staff booking dialog.
 *
 * The dialog used one `<input type="datetime-local">`, which on a desktop
 * browser means scrolling a spinner to the minute. Lauren, booking all day:
 * "the time clock is set to time slots - not having to scroll to a time...
 * at least make it half hour blocks."
 *
 * Everything here is wall-clock string work on the `YYYY-MM-DDTHH:mm` shape
 * the dialog already uses, with no Date arithmetic. That is deliberate: the
 * server turns the string into an instant with `parseBrisbaneLocalDateTime`,
 * and a Date built here would be read in the browser's zone and land an
 * hour out for anyone outside Brisbane. The timezone bug in `e6a4662` was
 * exactly this mistake.
 *
 * The interval is shared with online booking rather than redeclared, so the
 * salon only ever changes it in one place.
 */
import { ONLINE_BOOKING_SLOT_INTERVAL_MINUTES, SALON_LAST_DROP_OFF_MINUTES, inSalonQuietWindow } from "./onlineBookingSlots";

/**
 * Staff can book an hour either side of the public online-booking window
 * (08:00–17:00). Early drop-offs and a late collection are routine, and a
 * dropdown that cannot express them sends staff back to typing.
 */
export const STAFF_BOOKING_OPEN_MINUTES = 7 * 60;
export const STAFF_BOOKING_CLOSE_MINUTES = 18 * 60;

/**
 * The hours the salon actually takes dogs in.
 *
 * Lauren, 10/11/2026, with the Next available dialog open on 7am:
 * "can we adjust the times to our work hours, first dogs 7:30, last
 * booking come in at 1pm".
 *
 * This is NOT the dropdown above, and the difference is the point. The
 * dropdown is what staff may TYPE — it has to be able to express the
 * odd booking, because the diary has 31 bookings at 13:30 and 10 at
 * 14:00 in the last six months and narrowing it would make those
 * impossible to record. This is what the app may OFFER: a time read
 * down the phone to a client, or suggested in the rebook dialog. The
 * app should never propose a time the salon does not work.
 *
 * Measured over 5,245 appointments on 10/11/2026: 11 start before 07:30
 * — one at 07:00, three at 07:25, the rest at 3am and 5am and obviously
 * import noise — so nothing real is lost at the early end either.
 *
 * Hardcoded, like every other hour in this file. There is no
 * opening-hours column on `tenants`, so a second salon with different
 * hours needs one; this is the constant it would come from.
 */
export const SALON_FIRST_BOOKING_MINUTES = 7 * 60 + 30;
// Shared with online booking, so both sides stop at the same time.
export const SALON_LAST_BOOKING_MINUTES = SALON_LAST_DROP_OFF_MINUTES;

// The mid-morning quiet window lives in onlineBookingSlots.ts, beside the
// other half of the offer rules, so online booking and the portal's
// reschedule leave it out too. Re-exported here for the staff side.
export {
  SALON_QUIET_AFTER_MINUTES,
  SALON_QUIET_BEFORE_MINUTES,
  inSalonQuietWindow,
} from "./onlineBookingSlots";

/**
 * Every start time the app may offer, in salon minutes.
 *
 * Both ends inclusive: "last booking come in at 1pm" means 1pm is a
 * booking, not the minute after the last one. The mid-morning quiet
 * window is left out.
 */
export function salonBookingStarts(stepMinutes?: number): number[] {
  const step = stepMinutes ?? ONLINE_BOOKING_SLOT_INTERVAL_MINUTES;
  if (step <= 0) return [];
  const starts: number[] = [];
  for (
    let at = SALON_FIRST_BOOKING_MINUTES;
    at <= SALON_LAST_BOOKING_MINUTES;
    at += step
  ) {
    if (!inSalonQuietWindow(at)) starts.push(at);
  }
  return starts;
}

export type TimeSlot = { value: string; label: string };

/** 540 → "9:00 am". Midday and midnight read as 12, not 0. */
export function formatSlotLabel(minutesFromMidnight: number): string {
  const hours24 = Math.floor(minutesFromMidnight / 60) % 24;
  const minutes = minutesFromMidnight % 60;
  const suffix = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** 540 → "09:00", the value an `<input type="time">` and the join below use. */
export function minutesToTimeValue(minutesFromMidnight: number): string {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "09:30" → 570. Returns null for anything that is not a time. */
export function timeValueToMinutes(
  value: string | null | undefined
): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * The slots offered in the dropdown.
 *
 * `include` adds a time that is not on the grid — an existing booking at
 * 09:15, or a slot the calendar was clicked on — so opening the dialog
 * never silently moves an appointment to the nearest half hour.
 */
export function buildTimeSlots(options?: {
  openMinutes?: number;
  closeMinutes?: number;
  stepMinutes?: number;
  include?: string | null;
}): TimeSlot[] {
  const open = options?.openMinutes ?? STAFF_BOOKING_OPEN_MINUTES;
  const close = options?.closeMinutes ?? STAFF_BOOKING_CLOSE_MINUTES;
  const step = options?.stepMinutes ?? ONLINE_BOOKING_SLOT_INTERVAL_MINUTES;

  const minutes: number[] = [];
  if (step > 0) {
    for (let at = open; at <= close; at += step) minutes.push(at);
  }

  const extra = timeValueToMinutes(options?.include ?? null);
  if (extra !== null && !minutes.includes(extra)) minutes.push(extra);

  return minutes
    .sort((a, b) => a - b)
    .map(at => ({ value: minutesToTimeValue(at), label: formatSlotLabel(at) }));
}

/**
 * Split "2026-11-18T11:30" into its date and time halves.
 *
 * Both empty for an empty or malformed value, so a half-filled form shows
 * empty fields rather than "Invalid Date".
 */
export function splitLocalDateTime(value: string | null | undefined): {
  date: string;
  time: string;
} {
  if (!value) return { date: "", time: "" };
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value.trim());
  if (!match) return { date: "", time: "" };
  return { date: match[1], time: match[2] };
}

/**
 * Put the halves back together.
 *
 * Empty when either half is missing: a date with no time is not a booking,
 * and emitting "2026-11-18T" would be stored as an invalid start.
 */
export function joinLocalDateTime(date: string, time: string): string {
  if (!date || !time) return "";
  const minutes = timeValueToMinutes(time);
  if (minutes === null) return "";
  return `${date}T${minutesToTimeValue(minutes)}`;
}
