/**
 * "Last visit" and "Next visit" on a client's page.
 *
 * Lauren, 11/11/2026, on Pat Grant: "This is showing the wrong next date."
 * Both read 28 Apr 2027. The page took the FIRST booking in its list as
 * the last visit and the first future booking as the next — and the list
 * is newest first, so both landed on the furthest-out booking. Dianne
 * Williams's page read "Last visit 16 Dec 2026" the same morning for the
 * same reason. Cancelled bookings counted too.
 *
 * Now: last visit is the most recent booking before now that was not
 * cancelled or a no-show; next visit is the soonest one from now on.
 */

export type VisitLike = {
  scheduledStart: Date | string;
  status?: string | null;
  workflowState?: string | null;
};

const NOT_A_VISIT = new Set(["cancelled", "no_show"]);

const isVisit = (a: VisitLike) =>
  !NOT_A_VISIT.has(String(a.status ?? "")) && !NOT_A_VISIT.has(String(a.workflowState ?? ""));

export function clientVisitDates<T extends VisitLike>(appointments: readonly T[], now: Date = new Date()): { last: T | null; next: T | null } {
  const at = now.getTime();
  let last: T | null = null;
  let next: T | null = null;
  for (const a of appointments) {
    if (!isVisit(a)) continue;
    const t = new Date(a.scheduledStart).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < at) {
      if (!last || t > new Date(last.scheduledStart).getTime()) last = a;
    } else if (!next || t < new Date(next.scheduledStart).getTime()) {
      next = a;
    }
  }
  return { last, next };
}
