/**
 * Stopping one press on the workflow board from moving a dog twice.
 *
 * Lauren, 12/11/2026: "so many dogs have been marked out when they are
 * finished being dried ... the bathers are impatient and keep pressing the
 * next stage button cause its not syncing quick enough which in turn marks
 * them out."
 *
 * Two different things can make that happen, and they need different
 * guards:
 *
 *  1. A STALE SCREEN. The board refreshes every 20 seconds and there are
 *     several screens in the salon. A press made on a screen still
 *     showing "drying", after somebody else already moved the dog on,
 *     used to be applied as though the screen were right. So the board
 *     now says which stage it was looking at, and the server judges the
 *     press against where the dog really is (`judgeStagePress`).
 *
 *  2. A FAST FINGER. The press lands, the row redraws with the NEXT
 *     stage's button under the same finger, and the second press of an
 *     impatient double-tap is a perfectly valid press on a fresh screen.
 *     No server check can tell that from intent. So each dog's stage
 *     buttons are held from the press until the board has redrawn, and
 *     for a moment after (`stagePressLocked`).
 */

export type StagePressVerdict =
  /** The screen was right: do it. */
  | "apply"
  /** The dog is already at the stage asked for: a repeat press, nothing to do. */
  | "already_there"
  /** The dog has moved somewhere else since the screen was drawn: refuse. */
  | "stale";

export function judgeStagePress(input: {
  /** The stage the pressing screen was showing. Absent from older screens. */
  expectedFromState?: string | null;
  /** Where the dog is now. */
  currentState: string;
  /** Where the press wants it. */
  targetState: string;
}): StagePressVerdict {
  // A screen that did not say what it saw is treated as before, so a
  // browser tab loaded before this shipped keeps working.
  if (input.expectedFromState === undefined || input.expectedFromState === null) return "apply";
  if (input.currentState === input.expectedFromState) return "apply";
  if (input.currentState === input.targetState) return "already_there";
  return "stale";
}

export const STALE_STAGE_PRESS_MESSAGE =
  "That dog had already been moved by someone else. The board has been refreshed; check its stage and press again if it still needs moving.";

/** How long a dog's stage buttons stay held after the board has redrawn. */
export const STAGE_PRESS_SETTLE_MS = 1500;

/**
 * The longest a press may hold a dog's buttons while waiting for the
 * server. A lost reply must never leave a dog that nobody can move.
 */
export const STAGE_PRESS_MAX_HOLD_MS = 15_000;

/** Whether this dog's stage buttons are being held right now. */
export function stagePressLocked(lockedUntilMs: number | undefined, nowMs: number): boolean {
  return lockedUntilMs !== undefined && nowMs < lockedUntilMs;
}
