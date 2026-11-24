/**
 * The previous / next day buttons, shared by the calendar and the workflow
 * board so the two date controls cannot drift apart.
 *
 * Andy, 24/11/2026, of the board's old joined arrow-date-arrow strip:
 * "Workflow board date selector looks terrible. Make it the same as the
 * appointments one."
 *
 * 44px square: the smallest comfortable touch target on the tablet the
 * salon floor uses.
 */
export const DAY_STEP_BUTTON =
  "h-11 w-11 rounded-[var(--radius-control)] border border-primary/25 bg-primary/8 " +
  "text-primary hover:border-primary/45 hover:bg-primary/15 hover:text-primary";

/** The solid Today button between them. */
export const DAY_TODAY_BUTTON = "h-11 px-6 text-base font-semibold";
