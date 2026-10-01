/**
 * Splitting a client's appointments into what is coming and what has been.
 *
 * Staff looking a client up want "when are they next in?" first; the history
 * matters far less often, which is why it collapses. Kept here as a pure
 * function so the boundary conditions — an appointment happening right now,
 * a cancellation, a no-show — are pinned by tests rather than discovered on
 * the salon floor.
 */

export type HistoryAppointment = {
  id: number;
  scheduledStart: Date | string | number;
  status?: string | null;
  workflowState?: string | null;
};

export type SplitAppointments<T> = {
  upcoming: T[];
  past: T[];
};

/** Appointments that will never happen; they belong in history whenever they fall. */
const DEAD_STATUSES = new Set(["cancelled", "no_show"]);

function startMs(value: HistoryAppointment["scheduledStart"]): number {
  const ms = new Date(value as string).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function isStillToCome(appointment: HistoryAppointment, now: Date): boolean {
  const status = (appointment.status ?? "").toLowerCase();
  const state = (appointment.workflowState ?? "").toLowerCase();
  // A cancelled booking next Tuesday is not something the client is coming to.
  if (DEAD_STATUSES.has(status) || DEAD_STATUSES.has(state)) return false;
  return startMs(appointment.scheduledStart) >= now.getTime();
}

/**
 * Upcoming soonest-first (the next visit is the answer to the question),
 * past most-recent-first (the last visit is the interesting one).
 */
export function splitAppointmentsByTime<T extends HistoryAppointment>(
  rows: readonly T[],
  now: Date,
): SplitAppointments<T> {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const row of rows) {
    (isStillToCome(row, now) ? upcoming : past).push(row);
  }
  upcoming.sort((a, b) => startMs(a.scheduledStart) - startMs(b.scheduledStart));
  past.sort((a, b) => startMs(b.scheduledStart) - startMs(a.scheduledStart));
  return { upcoming, past };
}
