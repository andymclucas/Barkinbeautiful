/**
 * What to say about the dates a repeating booking could not take.
 *
 * Lauren, 19/11/2026, booking a four-weekly repeat for two dogs that
 * already had bookings on those Fridays: "Not booked — the groomer is
 * already busy: Fri 20 Nov, Fri 18 Dec, …". Nobody was busy. The dogs
 * were already booked on those days, the server said exactly that, and
 * the new-booking form printed its own fixed sentence over the top. The
 * Repeat panel on an existing booking had been grouping by the server's
 * reason since 10/11/2026; the new-booking form never was.
 *
 * One function for both, so the reason shown is always the server's.
 */
export type SkippedOccurrence = { scheduledStart: Date | string; reason?: string | null };

const FALLBACK_REASON = "It could not be booked";

export function skippedOccurrenceMessages(
  skipped: readonly SkippedOccurrence[],
  formatDay: (when: Date | string) => string,
): string[] {
  const byReason = new Map<string, string[]>();
  for (const item of skipped) {
    const reason = item.reason?.trim() || FALLBACK_REASON;
    byReason.set(reason, [...(byReason.get(reason) ?? []), formatDay(item.scheduledStart)]);
  }
  return Array.from(byReason, ([reason, days]) => `Not booked on ${days.join(", ")}. ${reason.replace(/\.$/, "")}.`);
}
