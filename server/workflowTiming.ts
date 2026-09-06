export type WorkflowState =
  | "scheduled"
  | "checked_in"
  | "waiting_for_bath"
  | "bathing"
  | "waiting_for_dry"
  | "drying"
  | "waiting_for_groom"
  | "grooming"
  | "ready"
  | "complete"
  | "cancelled"
  | "no_show";

const INTER_STAGE_WAIT_STATES = new Set<WorkflowState>([
  "waiting_for_bath",
  "waiting_for_dry",
  "waiting_for_groom",
]);

export type WorkflowTimingSnapshot = {
  workflowState: WorkflowState;
  checkedInAt?: number | null;
  bathingStartedAt?: number | null;
  bathingCompletedAt?: number | null;
  dryingStartedAt?: number | null;
  dryingCompletedAt?: number | null;
  groomingStartedAt?: number | null;
  groomingCompletedAt?: number | null;
  readyAt?: number | null;
  completedAt?: number | null;
  actualStart?: Date | null;
  actualEnd?: Date | null;
};

/**
 * Returns timestamp updates when a pet moves to a new operational stage.
 * Existing start timestamps are kept on rework so the first complete pass remains measurable.
 */
export function deriveWorkflowTimingUpdate(
  current: WorkflowTimingSnapshot,
  nextState: WorkflowState,
  now = Date.now(),
): Record<string, number | Date | null> {
  if (current.workflowState === nextState) return {};

  const isTerminalState = nextState === "cancelled" || nextState === "no_show";
  const isInterStageWait = INTER_STAGE_WAIT_STATES.has(nextState);
  const updates: Record<string, number | Date | null> = { stageStartedAt: isTerminalState || isInterStageWait ? null : now };
  // Close the active operational timer as soon as a pet leaves its stage.
  // This also protects recorded durations if staff drag directly past a stage.
  const completionFieldByStage = {
    bathing: "bathingCompletedAt",
    drying: "dryingCompletedAt",
    grooming: "groomingCompletedAt",
  } as const;
  const completionField = completionFieldByStage[current.workflowState as keyof typeof completionFieldByStage];
  if (completionField && current[completionField] == null) {
    updates[completionField] = now;
  }
  switch (nextState) {
    case "checked_in":
      updates.checkedInAt = current.checkedInAt ?? now;
      updates.actualStart = current.actualStart ?? new Date(now);
      break;
    case "bathing":
      updates.bathingStartedAt = current.bathingStartedAt ?? now;
      break;
    case "drying":
      if (current.workflowState === "bathing" && current.bathingCompletedAt == null) updates.bathingCompletedAt = now;
      updates.dryingStartedAt = current.dryingStartedAt ?? now;
      break;
    case "grooming":
      if (current.workflowState === "drying" && current.dryingCompletedAt == null) updates.dryingCompletedAt = now;
      updates.groomingStartedAt = current.groomingStartedAt ?? now;
      break;
    case "ready":
      if (current.workflowState === "grooming" && current.groomingCompletedAt == null) updates.groomingCompletedAt = now;
      updates.readyAt = current.readyAt ?? now;
      break;
    case "complete":
      updates.completedAt = current.completedAt ?? now;
      updates.actualEnd = current.actualEnd ?? new Date(now);
      break;
  }
  return updates;
}
