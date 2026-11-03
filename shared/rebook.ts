/**
 * Booking the next visit from the one in front of you.
 *
 * Lauren, 03/11/2026: "a rebook button.. to schedule from today's
 * booking and make one jumping ahead in time. Instead of manually
 * going in and asking the clients again their name.. to bring up their
 * file."
 *
 * The client is standing at the counter having just collected the dog.
 * Everything needed is already on screen — the dog, the groomer, the
 * service, how often they come — so the only real question is which
 * day, and this works that out rather than asking.
 *
 * Pure. Placement against a busy diary is planMembershipSeries's job,
 * which already does it and is already tested; this decides how far
 * ahead to aim.
 */

/** Brisbane has no DST, so a week is exactly seven days of clock time. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function addWeeks(from: Date, weeks: number): Date {
  return new Date(from.getTime() + weeks * WEEK_MS);
}

export type IntervalSource = "membership" | "history" | "default" | "manual";

export type RebookInterval = {
  weeks: number;
  source: IntervalSource;
  /** Said to the person pressing the button, so the number is never a mystery. */
  reason: string;
};

/** What to assume when a dog has no membership and no history to read. */
export const DEFAULT_REBOOK_WEEKS = 6;

/**
 * How far ahead to put the next visit.
 *
 * In order of trust:
 *
 *  1. The membership tier. It is what the client is PAYING for, and
 *     the salon's whole cadence is built on it.
 *  2. What this dog actually does. A casual client on a steady
 *     seven-week rhythm should be offered seven, not a house default
 *     they have never once followed.
 *  3. Six weeks, the commonest interval here.
 *
 * History is only trusted when it looks like a rhythm. One visit says
 * nothing, and a gap of a year is a client who drifted away rather
 * than a cadence to repeat — offering "next visit in 52 weeks" would
 * be worse than offering nothing.
 */
export function rebookInterval(input: {
  membershipTierWeeks?: number | null;
  /** Gaps between this dog's recent visits, most recent first. */
  recentGapWeeks?: readonly number[] | null;
}): RebookInterval {
  if (input.membershipTierWeeks && input.membershipTierWeeks > 0) {
    return {
      weeks: input.membershipTierWeeks,
      source: "membership",
      reason: `every ${input.membershipTierWeeks} weeks on their membership`,
    };
  }

  const usable = (input.recentGapWeeks ?? []).filter((g) => Number.isFinite(g) && g >= 2 && g <= 16);
  if (usable.length >= 2) {
    // Median, not mean: one long gap over Christmas should not drag the
    // whole rhythm out.
    const sorted = [...usable].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const weeks = Math.round(median);
    return { weeks, source: "history", reason: `usually about every ${weeks} weeks` };
  }

  return {
    weeks: DEFAULT_REBOOK_WEEKS,
    source: "default",
    reason: `no pattern yet — offering the usual ${DEFAULT_REBOOK_WEEKS} weeks`,
  };
}

/**
 * Whole weeks between two visits, for reading a dog's rhythm.
 *
 * Rounded, because a booking moved a day either way is the same
 * cadence: 41 days and 43 days are both "six weeks" to a salon.
 */
export function gapInWeeks(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / WEEK_MS);
}

/** Gaps between a run of visit dates, oldest first in, most recent first out. */
export function gapsBetween(visits: readonly Date[]): number[] {
  const sorted = [...visits].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(gapInWeeks(sorted[i - 1], sorted[i]));
  return gaps.reverse();
}

/**
 * The quick-jump intervals offered beside the date.
 *
 * Lauren, 03/11/2026: "Give the quick jump option like there is on the
 * main calendar. 2-14 weeks etc when rebooking an appointment. But look
 * at their history and give a recommendation based on this but can do a
 * manual override at any time."
 *
 * One to fourteen, which is deliberately the SAME set as the calendar
 * sidebar's own Quick jump (`QUICK_JUMP_WEEKS` in CalendarSidebar) rather
 * than a tidier-looking subset. She asked for the thing she already uses,
 * and every number in between is real here: the salon has dogs on three,
 * five and seven weeks, and `rebookInterval` reads those straight off
 * their history. One week is a redo, which is rare but does happen.
 *
 * The calendar's REPEAT picker offers evens only - that one is setting up
 * a standing series, which is a different question.
 */
export const REBOOK_WEEK_CHOICES = Array.from({ length: 14 }, (_, i) => i + 1);

/**
 * The buttons to draw, with the recommendation always among them.
 *
 * A dog whose rhythm works out at nine weeks would otherwise have a
 * recommendation that no button matched — so the chip row would show
 * nothing selected while the date box said nine weeks out, which reads
 * as a bug. Whatever was recommended is a choice you can get back to.
 */
export function rebookWeekOptions(recommendedWeeks: number): number[] {
  const options = new Set<number>(REBOOK_WEEK_CHOICES);
  if (Number.isFinite(recommendedWeeks) && recommendedWeeks > 0) {
    options.add(Math.round(recommendedWeeks));
  }
  return [...options].sort((a, b) => a - b);
}

/** How a chosen interval is explained, once somebody has overridden the suggestion. */
export function manualInterval(weeks: number): RebookInterval {
  return { weeks, source: "manual", reason: `set by hand to ${weeks} week${weeks === 1 ? "" : "s"}` };
}
