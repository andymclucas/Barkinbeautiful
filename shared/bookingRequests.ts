/**
 * What counts as a booking request waiting for the salon.
 *
 * Andy, 27/11/2026: "We need to have a safety so that people can't book in
 * online without Lauren (or the other groomers) approving it ... a section
 * on the platform where staff can see the booking requests and click these
 * to take them to the live calendar date and approve".
 *
 * A request is a booking a CLIENT made, on the public /book page or in the
 * client portal (both set booked_online), that is still "pending". The
 * "booked online" half matters: thousands of MoeGo imports are also
 * "pending", and none of them is a request.
 *
 * A request whose time has already passed is no longer something to
 * approve, so it drops off the list a day after its start.
 */
export const REQUEST_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isOpenBookingRequest(
  appt: { bookedOnline: boolean | number | null; status: string | null; workflowState?: string | null; scheduledStart: Date | string },
  now: Date = new Date(),
): boolean {
  if (!Number(appt.bookedOnline)) return false;
  if (appt.status !== "pending") return false;
  if (appt.workflowState === "cancelled" || appt.workflowState === "no_show") return false;
  const start = new Date(appt.scheduledStart).getTime();
  return Number.isFinite(start) && start > now.getTime() - REQUEST_STALE_AFTER_MS;
}
