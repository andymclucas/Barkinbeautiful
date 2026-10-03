/**
 * Parses an appointment scheduling datetime string into the correct UTC Date,
 * handling two distinct formats that appear across this codebase:
 *
 * 1. A naive "YYYY-MM-DDTHH:mm" (or with seconds) string -- the kind produced
 *    by an HTML <input type="datetime-local">, with no timezone marker at
 *    all. This is interpreted as Brisbane (Australia/Queensland) wall-clock
 *    time, since that's where the business operates.
 * 2. A fully-qualified ISO 8601 string with a "Z" or explicit +/-HH:mm
 *    offset (e.g. from `Date.prototype.toISOString()`), which is already
 *    unambiguous and safe to hand straight to `new Date()`.
 *
 * This distinction matters because `new Date("2026-09-03T10:30")` (case 1,
 * no marker) is parsed in the *server's* local timezone, not Brisbane's.
 * Since the app server may run in UTC or any other timezone depending on
 * host, passing these naive strings straight to `new Date()` silently
 * shifts every appointment time by however many hours separate the server's
 * timezone from Brisbane's -- the appointment gets saved, but at the wrong
 * time, and can appear to simply vanish from the calendar view staff expect
 * it in. Fully-qualified strings (case 2) don't have this problem and must
 * NOT be re-interpreted as Brisbane local time, or they'd be shifted twice.
 *
 * Queensland does not observe daylight saving, so the +10:00 offset used
 * for case 1 is constant year-round -- no DST table needed.
 */
export function parseBrisbaneLocalDateTime(value: string): Date {
  const hasTimezoneMarker = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  if (hasTimezoneMarker) {
    return new Date(value);
  }
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) {
    throw new Error(`Expected a "YYYY-MM-DDTHH:mm" datetime string, got: ${value}`);
  }
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 10, // Brisbane is UTC+10 year-round
      Number(minute),
      second ? Number(second) : 0
    )
  );
}

/**
 * The Brisbane calendar date for an instant, as "YYYY-MM-DD".
 *
 * Reporting ranges must be anchored to the salon's own day boundaries, not the
 * viewer's. Without this, a staff member in another timezone — or simply a
 * machine whose clock is not set to Brisbane — sees a different set of
 * appointments for "the last 30 days", and appointments near midnight fall into
 * the wrong period.
 */
export function brisbaneDateKey(instant: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is what parseBrisbaneLocalDateTime wants.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Inclusive Brisbane-local day range covering the last `days` days up to and
 * including today, returned as UTC instants ready to compare against stored
 * timestamps.
 *
 * `brisbaneRangeForDays(30)` means "from 00:00:00 Brisbane 30 days ago through
 * 23:59:59 Brisbane today", regardless of where the browser is.
 */
/**
 * The calendar period a salon owner means by "this month".
 *
 * The Analytics page offered "This Week / This Month / This Year" and
 * quietly ran a rolling 7 / 30 / 365-day window instead. On 3 October
 * "This Month" showed 3 September onwards — $36k of real revenue against
 * three trading days of actual October. The figures were right and the
 * label was wrong, which is worse than either.
 *
 * Weeks start Monday: the salon trades Tue–Fri, so a Sunday-start week
 * would split a trading week across two periods.
 */
export type CalendarPeriod = "week" | "month" | "year";

export function brisbaneCalendarPeriod(
  period: CalendarPeriod,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const todayKey = brisbaneDateKey(now);
  const to = parseBrisbaneLocalDateTime(`${todayKey}T23:59:59`);
  const [y, m, d] = todayKey.split("-").map(Number);

  if (period === "year") {
    return { from: parseBrisbaneLocalDateTime(`${y}-01-01T00:00:00`), to };
  }
  if (period === "month") {
    return { from: parseBrisbaneLocalDateTime(`${todayKey.slice(0, 7)}-01T00:00:00`), to };
  }
  // Monday of the current Brisbane week.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
  const backToMonday = (dow + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - backToMonday));
  const mondayKey = monday.toISOString().slice(0, 10);
  return { from: parseBrisbaneLocalDateTime(`${mondayKey}T00:00:00`), to };
}

/**
 * An explicit from/to the user typed, as Brisbane calendar days.
 *
 * Both ends inclusive: someone asking for 1 Jan to 31 Dec means the whole
 * of both days, not up to midnight on the 31st. A reversed pair is
 * swapped rather than returning nothing, because a date picker makes that
 * easy to do by accident.
 */
export function brisbaneExplicitRange(fromKey: string, toKey: string): { from: Date; to: Date } {
  const valid = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);
  const a = valid(fromKey) ? fromKey : brisbaneDateKey(new Date());
  const b = valid(toKey) ? toKey : brisbaneDateKey(new Date());
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return {
    from: parseBrisbaneLocalDateTime(`${lo}T00:00:00`),
    to: parseBrisbaneLocalDateTime(`${hi}T23:59:59`),
  };
}

export function brisbaneRangeForDays(days: number, now: Date = new Date()): { from: Date; to: Date } {
  const todayKey = brisbaneDateKey(now);
  const to = parseBrisbaneLocalDateTime(`${todayKey}T23:59:59`);

  // Step back `days` whole days from Brisbane midnight today, so the window is
  // not skewed by the current time of day.
  const startOfToday = parseBrisbaneLocalDateTime(`${todayKey}T00:00:00`);
  const fromKey = brisbaneDateKey(new Date(startOfToday.getTime() - days * 24 * 60 * 60 * 1000));
  const from = parseBrisbaneLocalDateTime(`${fromKey}T00:00:00`);

  return { from, to };
}

/**
 * The year a range covers, if it covers exactly that whole calendar year.
 *
 * Returned as a string, and as "" when it is anything else, because it
 * drives a <Select> value directly: the control must sit on nothing while
 * a preset like "Month to date" is active, so that choosing the current
 * year still registers as a change and widens the range to the whole of
 * it. If it reported "2026" for 1–3 October, picking 2026 would do
 * nothing at all.
 */
export function wholeCalendarYear(fromKey: string, toKey: string): string {
  const year = fromKey.slice(0, 4);
  return fromKey === `${year}-01-01` && toKey === `${year}-12-31` ? year : "";
}

/**
 * One bad row must not produce a dropdown of fifty years.
 */
export const MAX_YEARS_OFFERED = 12;

/**
 * The years a reporting date picker should offer, newest first.
 *
 * A native date input steps one month per click, so reaching mid-2024
 * from October 2026 is twenty-seven clicks on a small arrow. Offering the
 * years outright makes it one.
 *
 * The bounds come from the bookings rather than being hardcoded, so an
 * older import appears in the list instead of being unreachable, and a
 * forward booking in a future year is offered too. The current year is
 * always included — on an empty database it is the only entry.
 */
export function yearOptions(
  earliest: number | null | undefined,
  latest: number | null | undefined,
  now: Date = new Date(),
): number[] {
  const thisYear = Number(brisbaneDateKey(now).slice(0, 4));
  const sane = (y: number | null | undefined): y is number =>
    typeof y === "number" && Number.isInteger(y) && y > 1970 && y < 3000;

  const oldest = Math.min(sane(earliest) ? earliest : thisYear, thisYear);
  const newest = Math.max(sane(latest) ? latest : thisYear, thisYear);
  const floor = Math.max(oldest, newest - (MAX_YEARS_OFFERED - 1));

  const years: number[] = [];
  for (let y = newest; y >= floor; y--) years.push(y);
  return years;
}

/**
 * A "YYYY-MM-DD" day as a Date at midnight in the RUNTIME's own timezone.
 *
 * Deliberately local, and the one place in this file that is. A calendar
 * grid asks "which square is this date in", which is a question about the
 * viewer's own clock — react-day-picker reads `getMonth()` and
 * `getDate()`, not an instant. Handing it the Brisbane instant for 1 Jan
 * (31 Dec 14:00 UTC) would draw the wrong square for anyone west of
 * Brisbane. Pair it with `localCalendarDayKey` and the round trip is
 * exact in every timezone.
 *
 * Never use this to query or store anything: a reporting window still
 * belongs to the salon's day, which is what `brisbaneExplicitRange` is
 * for.
 */
export function localCalendarDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** The inverse: a local Date back to its "YYYY-MM-DD". */
export function localCalendarDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
