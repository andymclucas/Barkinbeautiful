/**
 * Every timestamp shown anywhere in Groomigo — staff UI, client portal,
 * emails, SMS, audit logs — must render in Australia/Brisbane time
 * regardless of the server's or browser's own system timezone. The Render
 * server runs in UTC by default, so a bare toLocaleString/toLocaleDateString/
 * toLocaleTimeString call server-side silently produces UTC-labelled output
 * (e.g. an 8am AEST appointment reminder going out with "10pm" in the copy).
 * Always go through one of the helpers below instead of calling
 * Date#toLocale*String directly.
 */
const AEST_TIMEZONE = "Australia/Brisbane";

/** Formats an immutable audit instant for visible Groomigo staff activity records. */
export function formatAustralianAuditTimestamp(timestamp: number | string | Date | null | undefined) {
  if (!timestamp) return "Timestamp unavailable";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: AEST_TIMEZONE,
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
export function formatAestTime(timestamp: number | string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: AEST_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...opts,
  }).format(date);
}

/** AEST date only, e.g. "Fri, 18 Sep 2026". Use for appointment/booking dates everywhere. */
export function formatAestDate(timestamp: number | string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: AEST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(date);
}

/** AEST date + time together, e.g. "18 Sep 2026, 8:00 am". */
export function formatAestDateTime(timestamp: number | string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: AEST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...opts,
  }).format(date);
}
