/**
 * When moving one dog on the board should move the rest of its party.
 *
 * Andy, 27/10/2026: "when multi-dog families are checked in, it will
 * check in all linked dogs on the workflow." Charlie and Ruby Blackaby
 * arrive in one car; checking Charlie in and leaving Ruby showing
 * "Waiting" is a job the screen can do.
 *
 * The board already cascades COMPLETE for the same reason — one dog of a
 * family being collected means the whole party has gone. This states
 * which stages cascade and, more importantly, which dogs are eligible,
 * because those are different questions.
 */

/** Stages where moving one dog should move its linked dogs too. */
export const CASCADING_STAGES = ["checked_in", "complete"] as const;
export type CascadingStage = (typeof CASCADING_STAGES)[number];

export function cascades(stage: string): stage is CascadingStage {
  return (CASCADING_STAGES as readonly string[]).includes(stage);
}

/**
 * Whether a linked dog should be dragged along to `stage`.
 *
 * The asymmetry matters. Checking in only ever moves a dog that has not
 * arrived yet: if Ruby is already bathing, checking Charlie in must not
 * pull her backwards out of the bath and lose her timings. Completing
 * moves anything not already complete, because the party leaving is the
 * party leaving whatever stage each dog was at.
 */
export function shouldCascadeTo(stage: CascadingStage, linkedState: string): boolean {
  if (stage === "checked_in") return linkedState === "scheduled";
  return linkedState !== "complete";
}

/** Terminal rows are never dragged along, whatever the stage. */
export function cascadeEligible(status: string, workflowState: string): boolean {
  return status !== "cancelled" && status !== "no_show"
    && workflowState !== "cancelled" && workflowState !== "no_show";
}
