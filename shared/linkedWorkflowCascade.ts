/**
 * When moving one dog on the board should move the rest of its party.
 *
 * Two stages do, on deliberately different terms:
 *
 *  - **check-in**, only when a human says yes. Andy, 27/10/2026:
 *    "Perhaps a button that pops up to say 'would you like to check in
 *    all dogs related to this family?'" Charlie and Ruby Blackaby arrive
 *    in one car, but the staff member decides.
 *  - **complete**, automatically, which is behaviour the board has
 *    always had: one dog of a party being collected means the party has
 *    gone.
 *
 * Nothing else cascades, ever. Andy, same message: "No other stages in
 * the grooming cycle should have that feature. They need to be bathed,
 * dryed etc separately." Two dogs share a car, not a bath — one going
 * into the tub says nothing about where the other is.
 */

export type CascadeStage = "checked_in" | "complete";

/** Whether this stage may move linked dogs at all. */
export function stageCanCascade(stage: string): stage is CascadeStage {
  return stage === "checked_in" || stage === "complete";
}

/**
 * Whether moving to `stage` cascades without being asked.
 *
 * Completion does; check-in does not. Checking a dog in is a routine
 * action done dozens of times a day, and silently moving another dog
 * each time is the kind of surprise that makes staff distrust the
 * board. Collection happens once, at the end, and the party leaves
 * together.
 */
export function cascadesAutomatically(stage: CascadeStage): boolean {
  return stage === "complete";
}

/**
 * Whether a linked dog should be dragged along to `stage`.
 *
 * The asymmetry is the point. Check-in only ever moves a dog that has
 * NOT arrived: pulling a dog already in the bath back to "checked in"
 * would lose its timings and take it off the bather's queue mid-wash.
 * Completion moves anything not already complete.
 */
export function shouldCascadeTo(stage: CascadeStage, linkedState: string): boolean {
  if (stage === "checked_in") return linkedState === "scheduled";
  return linkedState !== "complete";
}

/** Terminal rows are never dragged along, whatever the stage. */
export function cascadeEligible(status: string, workflowState: string): boolean {
  return status !== "cancelled" && status !== "no_show"
    && workflowState !== "cancelled" && workflowState !== "no_show";
}

/** "Also check in Ruby?" / "Also check in Ruby and Bella?" */
export function describeCascadePrompt(petNames: readonly string[]): string | null {
  const names = petNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return null;
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Also check in ${list}?`;
}
