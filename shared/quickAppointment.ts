/**
 * A walk-in nail clip or a quick bath — in and out in ten minutes.
 *
 * Andy, 06/11/2026: a Quick Appointment button on the calendar, with the
 * client and dog name optional, a two-item service list, free pricing,
 * and a dog that shows on the board as "Walk-In: Nail Clip" without
 * going through the normal stages, "as these appts are usually done in
 * 10-15 mins".
 *
 * ## Why this is a flag and not two new service types
 *
 * The obvious move is to add "quick_bath" and "nail_clip" to
 * appointments.service_type. It is also the expensive one: that enum is
 * named in 54 places across the client, the server and shared, and
 * CLAUDE.md is explicit that adding a value means auditing every switch,
 * map and exhaustive check over it or the UI silently renders nothing.
 *
 * The existing values already say what the work is — nail_trim is a nail
 * clip, bath_only is a bath — so what was actually missing is "and it is
 * a ten-minute walk-in". That is one boolean, and reporting can still
 * tell a $25 quick bath from a $70 booked one by reading it.
 *
 * ## It deliberately does not use the 12-state machine
 *
 * A nail clip does not wait for a bath, get dried, then wait for a
 * groom. Put one through those stages and it sits on the board all
 * morning in a queue it does not belong to, and the bath priority list
 * counts a dog that needs no bath.
 */

export type QuickService = "nail_trim" | "bath_only";

export const QUICK_SERVICES: readonly { value: QuickService; label: string }[] = [
  { value: "nail_trim", label: "Nail Clip" },
  { value: "bath_only", label: "Quick Bath & Dry" },
];

export function isQuickService(value: unknown): value is QuickService {
  return value === "nail_trim" || value === "bath_only";
}

/** What staff picked, in their words. */
export function quickServiceLabel(serviceType: string): string {
  return QUICK_SERVICES.find((s) => s.value === serviceType)?.label ?? "Quick appointment";
}

/**
 * How it reads on the workflow board.
 *
 * Andy asked for it in these words — "Walk-In: then either the nail clip
 * or quick bath and dry" — and the prefix is what tells a groomer at a
 * glance that this one is not part of the day's run.
 */
export function quickBoardLabel(serviceType: string): string {
  return `Walk-In: ${quickServiceLabel(serviceType)}`;
}

/**
 * The only states a quick appointment moves through.
 *
 * Here, being done, done. Plus the two ways any booking can end.
 * `ready` is deliberately absent: there is no waiting around for
 * collection on a job the owner stands there for.
 */
export const QUICK_WORKFLOW_STATES: readonly string[] = [
  "scheduled", "checked_in", "complete", "cancelled", "no_show",
];

export function isQuickWorkflowState(state: string | null | undefined): boolean {
  return !!state && QUICK_WORKFLOW_STATES.includes(state);
}

/**
 * The next state a quick appointment goes to, or null when it is done.
 *
 * Three steps rather than ten, so the board's forward button means
 * something on a dog that is already in the chair.
 */
export function nextQuickWorkflowState(current: string): string | null {
  if (current === "scheduled") return "checked_in";
  if (current === "checked_in") return "complete";
  return null;
}

/** Ten to fifteen minutes, per Andy. Used for the end time when none is given. */
export const QUICK_DEFAULT_MINUTES = 15;

/** The name an unnamed walk-in is filed under. */
export const WALK_IN_CLIENT_NAME = "Walk-in";
