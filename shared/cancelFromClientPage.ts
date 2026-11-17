/**
 * Which bookings on a client's own page may be cancelled from there.
 *
 * Only a booking that is still to come and has not started: in the
 * future, not already cancelled or a no-show, and still "scheduled".
 * A dog that is checked in or on the tables is the workflow board's
 * business, and a past booking that never happened is a no-show, which is
 * a different record with different consequences.
 */
export function canCancelFromClientPage(
  booking: { scheduledStart: Date | string | number; status?: string | null; workflowState?: string | null },
  now: Date,
): boolean {
  const start = new Date(booking.scheduledStart).getTime();
  if (!Number.isFinite(start) || start <= now.getTime()) return false;
  const status = (booking.status ?? "").toLowerCase();
  if (status === "cancelled" || status === "no_show") return false;
  const stage = (booking.workflowState ?? "scheduled").toLowerCase();
  return stage === "scheduled";
}
