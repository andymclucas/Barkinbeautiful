/**
 * Dogs that have to be gone by a certain time, and whether they are at risk.
 *
 * Andy, 08/10/2026: "a dog must be going home by say 12pm.. bathers can be
 * aware." The point is the bathers: by the time a dog is visibly late the
 * chance to reorder the queue has already gone, so the warning has to come
 * while there is still something to do about it.
 *
 * So this is not a clock. It compares the time left against the work still
 * to do, using the salon's own duration model and the dog's size band — the
 * same figures the revenue weighting uses. A giant still in Bath Prep at
 * 11:00 with a midday deadline is in trouble; a small dog that is Ready is
 * not, however close the deadline.
 */
import { SIZE_HOURS } from "./sizeWeightedTargets";
import type { DogSizeBand } from "./dogSizeBand";

/**
 * Roughly how much of a dog's chair time is still ahead of it at each stage.
 *
 * Deliberately coarse. The exact split between bath, dry and groom varies by
 * coat and by who is working, and a precise-looking number here would be
 * false confidence. What matters is the difference between "barely started"
 * and "nearly done".
 */
const WORK_REMAINING: Record<string, number> = {
  scheduled: 1,
  checked_in: 1,
  waiting_for_bath: 0.95,
  bathing: 0.8,
  waiting_for_dry: 0.6,
  drying: 0.5,
  waiting_for_groom: 0.4,
  grooming: 0.25,
  ready: 0,
  complete: 0,
  cancelled: 0,
  no_show: 0,
};

export type CollectByRisk = "none" | "comfortable" | "tight" | "at_risk" | "overdue";

export type CollectByStatus = {
  risk: CollectByRisk;
  /** Minutes until the deadline. Negative once it has passed. */
  minutesLeft: number;
  /** Minutes of work we think is still ahead of this dog. */
  minutesNeeded: number;
  /** Short label for the badge, e.g. "BY 12:00". */
  label: string;
};

/** The deadline in the salon's own timezone, as "12:00". */
export function formatCollectBy(collectBy: Date | string | null | undefined): string | null {
  if (!collectBy) return null;
  const date = collectBy instanceof Date ? collectBy : new Date(collectBy);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

/**
 * How this dog is doing against its deadline.
 *
 * `comfortable` is still shown, not hidden — a bather glancing at the board
 * should be able to see that a dog has a deadline at all, before it becomes
 * a problem. Only dogs with no deadline return "none".
 */
export function collectByStatus(input: {
  collectBy: Date | string | null | undefined;
  workflowState: string;
  sizeBand?: DogSizeBand | null;
  now?: Date;
}): CollectByStatus {
  const { collectBy, workflowState, sizeBand, now = new Date() } = input;
  const label = formatCollectBy(collectBy);
  if (!label || !collectBy) {
    return { risk: "none", minutesLeft: 0, minutesNeeded: 0, label: "" };
  }

  const deadline = collectBy instanceof Date ? collectBy : new Date(collectBy);
  const minutesLeft = Math.round((deadline.getTime() - now.getTime()) / 60_000);

  // An unsized dog is assumed to take an hour — the salon's own figure for
  // its commonest size, and the one that understates least often.
  const totalHours = sizeBand ? SIZE_HOURS[sizeBand] : 1;
  const fractionLeft = WORK_REMAINING[workflowState] ?? 1;
  const minutesNeeded = Math.round(totalHours * 60 * fractionLeft);

  if (minutesNeeded === 0) {
    // Done or gone. Only the deadline itself can still be missed.
    const risk = minutesLeft < 0 ? "overdue" : "comfortable";
    return { risk, minutesLeft, minutesNeeded, label: `BY ${label}` };
  }
  if (minutesLeft < 0) return { risk: "overdue", minutesLeft, minutesNeeded, label: `BY ${label}` };

  // Half an hour of slack is the line. Thirty minutes of work with sixty
  // minutes left would have to take TWICE as long as expected to miss, and
  // flagging that would make the board noisy enough to ignore — which is
  // the failure mode that matters, because an alert nobody reads is worse
  // than no alert. Strictly less than, so exactly half an hour is fine.
  const slack = minutesLeft - minutesNeeded;
  const SLACK_MINUTES = 30;
  const risk: CollectByRisk =
    slack < 0 ? "at_risk" : slack < SLACK_MINUTES ? "tight" : "comfortable";
  return { risk, minutesLeft, minutesNeeded, label: `BY ${label}` };
}

/** Ordering for the board: the dog in most trouble first. */
export const RISK_ORDER: Record<CollectByRisk, number> = {
  overdue: 0, at_risk: 1, tight: 2, comfortable: 3, none: 4,
};
