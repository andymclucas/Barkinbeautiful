/**
 * Whether an appointment counts as cancelled, and what follows from it.
 *
 * Two columns can say so. `appointments.status` is
 * confirmed|pending|cancelled|no_show and `appointments.workflow_state` is
 * the 12-state machine, which also has `cancelled`. A booking cancelled
 * through the MoeGo sync sets both; one cancelled through the board may
 * set only the workflow state. Checking one column misses the other.
 *
 * The check was written out five times across Calendar.tsx and
 * ClientPortal.tsx, and the contract test pinned three of those as literal
 * source strings — so a sixth copy, or a changed one, was free to disagree
 * with the rest.
 *
 * What follows from it matters more than the check. A cancelled
 * appointment must not be dragged and must not have its time rewritten:
 * it stays at its original booked slot for historical tracking, because
 * the timing analytics and the day's revenue read those slots. Moving a
 * cancelled dog silently rewrites history.
 */
export type CancellableAppointment = {
  status?: string | null;
  workflowState?: string | null;
};

export function isCancelledAppointment(appointment: CancellableAppointment | null | undefined): boolean {
  if (!appointment) return false;
  return appointment.status === "cancelled" || appointment.workflowState === "cancelled";
}

/**
 * A cancelled booking keeps its original slot.
 *
 * Also true when the edit in progress is CANCELLING it — the dog is being
 * cancelled at the time it was booked for, not at whatever the form
 * happens to show.
 */
export function preservesOriginalSchedule(
  appointment: CancellableAppointment | null | undefined,
  pendingWorkflowState?: string | null,
): boolean {
  return isCancelledAppointment(appointment) || pendingWorkflowState === "cancelled";
}

/** A cancelled dog cannot be dragged to a new time. */
export function canDragAppointment(
  appointment: CancellableAppointment | null | undefined,
  hasDragHandler: boolean,
): boolean {
  return hasDragHandler && !isCancelledAppointment(appointment);
}
