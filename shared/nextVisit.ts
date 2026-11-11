/**
 * The visit after THIS one, for the "Next:" line on a booking.
 *
 * Lauren, 11/11/2026, opening a dog's 9:30 booking at 9:26: the card said
 * "Next: Wed, 11 Nov" — the booking she had open — so it looked as though
 * nothing was booked ahead, when 9 December and 6 January both were.
 *
 * It was "the dog's first booking after right now", which is the booking
 * itself until it starts, and it counted cancelled bookings too — the
 * same dog's cancelled 1 December would have shown ahead of the real
 * 9 December. Now: the first LIVE booking on a LATER DAY than this one.
 * A later day rather than a later time, so a second dog's row on the same
 * visit is never read as the next visit.
 */

export type VisitCandidate = { scheduledStart: Date | string; status?: string | null; workflowState?: string | null };

const NOT_A_VISIT = new Set(["cancelled", "no_show"]);

export function nextVisitAfter(
  currentStart: Date | string,
  candidates: readonly VisitCandidate[],
  dayKeyOf: (d: Date) => string,
): Date | null {
  const currentDay = dayKeyOf(new Date(currentStart));
  let best: Date | null = null;
  for (const c of candidates) {
    if (NOT_A_VISIT.has(String(c.status ?? "")) || NOT_A_VISIT.has(String(c.workflowState ?? ""))) continue;
    const at = new Date(c.scheduledStart);
    if (Number.isNaN(at.getTime())) continue;
    if (dayKeyOf(at) <= currentDay) continue;
    if (!best || at < best) best = at;
  }
  return best;
}
