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
