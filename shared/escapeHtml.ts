/**
 * Escape a value for insertion into HTML text or a quoted attribute.
 *
 * One copy, because there were four: `cardLinkEmail.ts`,
 * `staffAdminNotice.ts`, `ClientPortal.tsx` and `Calendar.tsx` each had
 * their own, and the one in `groomingReports.emailReport` was simply
 * missing — a pet name goes into that email unescaped to this day.
 * Four copies of a security-relevant one-liner is three too many: the
 * one that drifts is the one nobody is looking at.
 *
 * `'` is escaped as well as `"`. A single quote is a perfectly ordinary
 * character in a dog's name — O'Malley — and an attribute written with
 * single quotes would otherwise be escapable.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
