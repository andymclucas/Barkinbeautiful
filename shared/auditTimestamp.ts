/** Formats an immutable audit instant for visible Groomigo staff activity records. */
export function formatAustralianAuditTimestamp(timestamp: number | string | Date | null | undefined) {
  if (!timestamp) return "Timestamp unavailable";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
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
