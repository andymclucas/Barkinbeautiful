/**
 * Has this dog arrived at the salon?
 *
 * The workflow board is where a dog is checked in; the appointments calendar
 * is where the groomers actually look. Without this they had no way to see
 * who was already in the building without switching tabs.
 *
 * Deliberately broader than the literal `checked_in` state. The moment
 * someone moves a dog on to bathing it is still very much here, and a tick
 * that vanished as soon as work started would be worse than no tick at all.
 * So anything past `scheduled` counts as arrived, except the two states that
 * mean the dog never came.
 *
 * `complete` keeps the tick. The dog has gone home, but it did arrive, and on
 * a day view the honest reading of "who came in today" includes them.
 */
export const ARRIVED_WORKFLOW_STATES = [
  "checked_in",
  "waiting_for_bath",
  "bathing",
  "waiting_for_dry",
  "drying",
  "waiting_for_groom",
  "grooming",
  "ready",
  "complete",
] as const;

export function hasArrivedOnSite(
  workflowState: string | null | undefined,
  status?: string | null,
): boolean {
  if (status === "cancelled" || status === "no_show") return false;
  return ARRIVED_WORKFLOW_STATES.some((state) => state === workflowState);
}

/**
 * What the tick says to a screen reader, and on hover. "Checked in" is what
 * staff call it regardless of which stage the dog has since moved to.
 */
export function arrivalLabel(workflowState: string | null | undefined): string {
  if (workflowState === "complete") return "Checked in — groom complete";
  if (workflowState === "ready") return "Checked in — ready for pickup";
  return "Checked in";
}
