/**
 * One colour per workflow state, for every surface that draws them.
 *
 * These hexes were living in two files at once — `WorkflowDisplay.tsx`
 * (the TV board) and `WorkflowBoardTable.tsx` (the staff board) — with
 * nothing keeping them in step. Adding a third copy for the client
 * portal would have guaranteed the drift, so they move here and all
 * three import them.
 *
 * Andy, 21/10/2026, on the client view: "Make the different grooming
 * stages more evident and colourful. Possibly to match the workflow
 * board colour scheme." Matching is the point: a client who is told
 * their dog is on the amber step and a groomer looking at an amber
 * column are talking about the same thing.
 *
 * The values are the staff board's, unchanged. Slate is used twice, for
 * the two states that are not work in progress — not yet started, and
 * gone home.
 */

export const WORKFLOW_STAGE_COLOURS = {
  scheduled: "#94a3b8",          // slate — not here yet
  checked_in: "#06b6d4",         // cyan
  waiting_for_bath: "#64748b",   // slate — the queue, staff-only
  bathing: "#3b82f6",            // blue
  waiting_for_dry: "#7c3aed",    // violet, darker than drying
  drying: "#8b5cf6",             // violet
  waiting_for_groom: "#b45309",  // amber, darker than grooming
  grooming: "#f59e0b",           // amber
  ready: "#10b981",              // emerald
  complete: "#64748b",           // slate — gone home
  cancelled: "#ef4444",          // red
  no_show: "#ef4444",
} as const;

export type WorkflowStageColourKey = keyof typeof WORKFLOW_STAGE_COLOURS;

/**
 * Slate, for anything unrecognised. A workflow state added later must
 * render as something rather than as `undefined`, which CSS drops and
 * which shows up as an invisible bar nobody can explain.
 */
export const UNKNOWN_STAGE_COLOUR = "#94a3b8";

export function stageColour(state: string | null | undefined): string {
  if (!state) return UNKNOWN_STAGE_COLOUR;
  return WORKFLOW_STAGE_COLOURS[state as WorkflowStageColourKey] ?? UNKNOWN_STAGE_COLOUR;
}
