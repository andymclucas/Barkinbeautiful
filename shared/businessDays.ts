/**
 * Business-day arithmetic in the salon's timezone.
 *
 * Membership payments retry "on the next business day". The original helper
 * did `d.setDate(d.getDate() + 1)` and skipped `getDay()` 0 and 6 - both of
 * which read the SERVER's weekday. Render runs UTC, and Brisbane is UTC+10, so
 * between 10:00 and midnight Brisbane the server is still on the previous day.
 * A payment that failed on a Brisbane Saturday morning was scheduled to retry
 * on the Tuesday rather than the Monday: a day late, every time, on a weekly
 * billing cycle.
 *
 * These work on the Brisbane calendar date regardless of where the process
 * runs, and are pure so the awkward cases can be pinned down in tests.
 */

const BRISBANE = "Australia/Brisbane";

/** The Brisbane calendar date of an instant, as YYYY-MM-DD. */
export function brisbaneDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BRISBANE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** 0 = Sunday ... 6 = Saturday, for the Brisbane calendar date. */
export function brisbaneWeekday(instant: Date): number {
  const [y, m, d] = brisbaneDate(instant).split("-").map(Number);
  // Date.UTC on a bare date gives the weekday of that calendar date with no
  // timezone of its own to get in the way.
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isBrisbaneWeekend(instant: Date): boolean {
  const day = brisbaneWeekday(instant);
  return day === 0 || day === 6;
}

/**
 * The next Brisbane business day after `from`, returned as an instant at
 * `atHourBrisbane` local time (09:00 by default - when the retry job runs).
 *
 * Returning a fixed hour matters: carrying the original time of day forward
 * meant a failure at 23:30 Brisbane scheduled a retry at 23:30, outside any
 * window a human would notice it in.
 */
export function nextBrisbaneBusinessDay(from: Date, atHourBrisbane = 9): Date {
  const [y, m, d] = brisbaneDate(from).split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  do {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);

  // Brisbane is UTC+10 all year - no daylight saving - so the instant for
  // HH:00 Brisbane is simply HH-10 UTC on that calendar date.
  return new Date(Date.UTC(
    cursor.getUTCFullYear(),
    cursor.getUTCMonth(),
    cursor.getUTCDate(),
    atHourBrisbane - 10,
    0, 0, 0,
  ));
}

/**
 * How many business days to allow before a failure stops being retried and
 * becomes a human problem. Two strikes matches the existing handler's
 * behaviour, and is exported so the policy lives in one place rather than as
 * a bare `>= 2` in the middle of a scheduled job.
 */
export const MAX_PAYMENT_RETRIES = 2;

export function shouldRetryPayment(failedCount: number): boolean {
  return failedCount < MAX_PAYMENT_RETRIES;
}
