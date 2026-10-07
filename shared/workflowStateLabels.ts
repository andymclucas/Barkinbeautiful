/**
 * What each of the twelve workflow states is CALLED, in one place.
 *
 * The same state was written three different ways: the board said "Wait for
 * Bath", the waiting-room display said "Wait Bath", and the Pet Tracker told
 * the owner "Waiting for a bath". Changing a name meant finding all three,
 * and the Calendar's status dropdown generated its own from the raw value
 * with `.replace("_", " ")` — which replaces only the FIRST underscore, so
 * `waiting_for_dry` would have read "Waiting For_dry".
 *
 * The stored value never changes. `waiting_for_bath` stays `waiting_for_bath`
 * in appointments.workflow_state and in all 115 workflow_logs rows that
 * reference it; renaming an enum across two columns of a live audit trail
 * buys nothing when the thing people read is the label.
 */
export type WorkflowState =
  | "scheduled" | "checked_in" | "waiting_for_bath" | "bathing"
  | "waiting_for_dry" | "drying" | "waiting_for_groom" | "grooming"
  | "ready" | "complete" | "cancelled" | "no_show";

export const WORKFLOW_STATES: readonly WorkflowState[] = [
  "scheduled", "checked_in", "waiting_for_bath", "bathing",
  "waiting_for_dry", "drying", "waiting_for_groom", "grooming",
  "ready", "complete", "cancelled", "no_show",
];

type Label = { label: string; short: string };

/**
 * Staff-facing names.
 *
 * "Bath Prep", not "Wait for Bath": Andy, 08/10/2026. The dog is not
 * queueing, it is having its nails, pads and sanitary done before the bath
 * — that is work somebody is doing, and calling it waiting made the board
 * read as idle time. The two genuine queues keep their waiting names.
 */
const LABELS: Record<WorkflowState, Label> = {
  scheduled: { label: "Waiting", short: "WAIT" },
  checked_in: { label: "Checked In", short: "IN" },
  waiting_for_bath: { label: "Bath Prep", short: "PREP" },
  bathing: { label: "Bath", short: "BATH" },
  waiting_for_dry: { label: "Wait for Dry", short: "WAIT DRY" },
  drying: { label: "Drying", short: "DRY" },
  waiting_for_groom: { label: "Wait for Groom", short: "WAIT GROOM" },
  grooming: { label: "Groom", short: "GROOM" },
  ready: { label: "Ready", short: "READY" },
  complete: { label: "Out", short: "OUT" },
  cancelled: { label: "Cancelled", short: "CANX" },
  no_show: { label: "No Show", short: "NO SHOW" },
};

export function workflowStateLabel(state: string | null | undefined): string {
  if (!state) return "Unknown";
  return LABELS[state as WorkflowState]?.label
    // An unrecognised value is still shown rather than hidden, tidied up
    // properly — every underscore, not just the first one.
    ?? state.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function workflowStateShortLabel(state: string | null | undefined): string {
  if (!state) return "—";
  return LABELS[state as WorkflowState]?.short ?? workflowStateLabel(state).toUpperCase();
}

export function isWorkflowState(value: unknown): value is WorkflowState {
  return typeof value === "string" && (WORKFLOW_STATES as readonly string[]).includes(value);
}

/** The stages a dog passes through, in order — the twelve minus the two exits. */
export const PROGRESS_STATES: readonly WorkflowState[] = WORKFLOW_STATES.filter(
  (s) => s !== "cancelled" && s !== "no_show",
);
