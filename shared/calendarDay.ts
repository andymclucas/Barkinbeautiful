/**
 * Which calendar day it is somewhere, and simple arithmetic on that day.
 *
 * Both functions exist because the obvious ways to do this are wrong in
 * ways that only show up later:
 *
 *  - `new Date(Date.now() + 10 * 3600000).toISOString().slice(0, 10)`
 *    hardcodes Brisbane's +10. It is right in Queensland and wrong in
 *    every zone that observes daylight saving, which is most of the ones
 *    the timezone picker offers.
 *
 *  - `new Date(`${day}T00:00:00`)` parses as LOCAL time, so adding a day
 *    and reading it back with `toISOString()` converts twice. In Brisbane
 *    the two conversions cancel the increment exactly: "tomorrow" from
 *    2026-10-23 returns 2026-10-23. That is not a rounding error, it is a
 *    silent no-op, and it is what `resetForTomorrow` on the wall display
 *    did from the day it was written.
 *
 * So: the day comes from Intl with an explicit zone, and arithmetic is
 * done on the date parts directly, never through a Date round trip.
 */

/** The calendar day at `value` in `timeZone`, as "YYYY-MM-DD". */
export function dayInZone(value: Date | string | number, timeZone: string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    // en-CA renders ISO order natively, so there is nothing to reassemble.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
  } catch {
    return null;
  }
}

/**
 * `day` shifted by `delta` days, both as "YYYY-MM-DD".
 *
 * Uses UTC arithmetic on a date that carries no time, which cannot be
 * pulled across a boundary by an offset because there is no offset
 * involved. Month and year ends roll correctly, leap years included.
 */
export function addCalendarDays(day: string | null | undefined, delta: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((day ?? "").trim());
  if (!match || !Number.isFinite(delta)) return null;
  const at = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const moved = new Date(at + Math.trunc(delta) * 86_400_000);
  if (Number.isNaN(moved.getTime())) return null;
  return moved.toISOString().slice(0, 10);
}

/**
 * Whether `day` is before `other`. Both are "YYYY-MM-DD", which sorts
 * lexicographically, so this is a string compare and not a date one.
 */
export function isDayBefore(day: string | null | undefined, other: string | null | undefined): boolean {
  if (!day || !other) return false;
  return day < other;
}
