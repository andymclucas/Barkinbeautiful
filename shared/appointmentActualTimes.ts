/**
 * When a dog actually started and finished, as distinct from when it was
 * booked to.
 *
 * `scheduled_start` is the diary; `actual_start` and `actual_end` are what
 * happened. The timing analytics and the workflow review read the actuals,
 * so getting these wrong quietly corrupts every duration report.
 *
 * The rule was a nested ternary inside the stage-update insert, pinned by a
 * test asserting that exact line of source text. It is three decisions, and
 * the middle one is the one worth stating: moving a dog OUT of `complete`
 * — which the wall display can do, to undo a mis-tapped OUT from the floor
 * — must CLEAR the finish time. Leaving it set would record a dog as having
 * finished at a moment it was still being groomed.
 */
export function actualStartFor(input: {
  newState: string;
  currentActualStart: Date | null | undefined;
}): Date | null | undefined {
  // Arriving is the only thing that starts the clock. A later stage change
  // must not restart it, or a dog that goes back a stage looks quicker
  // than it was.
  return input.newState === "checked_in" ? new Date() : input.currentActualStart;
}

export function actualEndFor(input: {
  newState: string;
  previousState: string;
  currentActualEnd: Date | null | undefined;
  now?: Date;
}): Date | null | undefined {
  if (input.newState === "complete") return input.now ?? new Date();
  // Leaving `complete` for anything else: the dog is back on the floor and
  // has not finished after all.
  if (input.previousState === "complete") return null;
  return input.currentActualEnd;
}
