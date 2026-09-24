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
