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
import { ONLINE_BOOKING_SLOT_INTERVAL_MINUTES } from "./onlineBookingSlots";

/**
 * Staff can book an hour either side of the public online-booking window
 * (08:00–17:00). Early drop-offs and a late collection are routine, and a
 * dropdown that cannot express them sends staff back to typing.
 */
export const STAFF_BOOKING_OPEN_MINUTES = 7 * 60;
export const STAFF_BOOKING_CLOSE_MINUTES = 18 * 60;

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
export function timeValueToMinutes(value: string | null | undefined): number | null {
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
    .map((at) => ({ value: minutesToTimeValue(at), label: formatSlotLabel(at) }));
}

/**
 * Split "2026-11-18T11:30" into its date and time halves.
 *
 * Both empty for an empty or malformed value, so a half-filled form shows
 * empty fields rather than "Invalid Date".
 */
export function splitLocalDateTime(value: string | null | undefined): { date: string; time: string } {
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
