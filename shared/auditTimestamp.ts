/**
 * Every timestamp shown anywhere in Groomigo — staff UI, client portal,
 * emails, SMS, audit logs — must render in an explicit timezone, never the
 * server's or browser's own. The Render server runs in UTC, so a bare
 * toLocaleString/toLocaleDateString/toLocaleTimeString call server-side
 * silently produces UTC-labelled output (e.g. an 8am appointment reminder
 * going out with "10pm" in the copy). Always go through one of the helpers
 * below instead of calling Date#toLocale*String directly.
 *
 * Each helper takes an optional IANA zone. On the client, pass the signed-in
 * user's zone — `useTimezone()` in `@/lib/timezone` resolves it, falling back
 * to the salon's own `tenants.timezone`. Server-side copy (emails, SMS) should
 * pass the SALON's zone, because a reminder is about when to bring a dog in.
 *
 * The default stays Brisbane so that every call site that has not been given a
 * zone behaves exactly as it did before.
 */
export const DEFAULT_TIMEZONE = "Australia/Brisbane";

/** True only for a zone Intl actually recognises. Use before storing one. */
export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Guards against a malformed or unknown zone taking a page down. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Formats an immutable audit instant for visible Groomigo staff activity records. */
export function formatAustralianAuditTimestamp(timestamp: number | string | Date | null | undefined, timeZone?: string | null) {
  if (!timestamp) return "Timestamp unavailable";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: safeTimeZone(timeZone),
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

/** AEST time only, e.g. "8:00 am". Use for appointment/workflow times everywhere. */
export function formatAestTime(timestamp: number | string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions, timeZone?: string | null) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: safeTimeZone(timeZone),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...opts,
  }).format(date);
}

/** AEST date only, e.g. "Fri, 18 Sep 2026". Use for appointment/booking dates everywhere. */
export function formatAestDate(timestamp: number | string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions, timeZone?: string | null) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: safeTimeZone(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(date);
}

/** AEST date + time together, e.g. "18 Sep 2026, 8:00 am". */
export function formatAestDateTime(timestamp: number | string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions, timeZone?: string | null) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: safeTimeZone(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...opts,
  }).format(date);
}
