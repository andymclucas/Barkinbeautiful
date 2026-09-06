export const TERMINAL_WORKFLOW_STATES = ["complete", "cancelled", "no_show"] as const;

export function isTerminalWorkflowState(state: string | null | undefined): boolean {
  return TERMINAL_WORKFLOW_STATES.some(terminalState => terminalState === state);
}

export function shouldShowWorkflowRow({
  state,
  showCompleted,
  stageFilter,
}: {
  state: string | null | undefined;
  showCompleted: boolean;
  stageFilter: string;
}): boolean {
  if (state === "complete") return showCompleted || stageFilter === "complete";
  if (state === "cancelled" || state === "no_show") return stageFilter === state;
  return true;
}
