/**
 * How often this dog comes in, for the counter.
 *
 * Andy, 04/11/2026, relaying why Brooklyn still invoices in MoeGo: she
 * opens its Agenda because the names are quicker to find there with a
 * customer standing in front of her. "I want to include that it shows
 * the next booking date on there and also their last date (how many
 * weeks between would be a bonus so we can see their average time
 * between)."
 *
 * Deliberately the gap EITHER SIDE of this visit, not an average over
 * the dog's whole history. Two reasons, and the second is the real one:
 *
 * - The calendar already carries `lastAppointmentDate` and
 *   `nextAppointmentDate` per row. A true average needs every past
 *   visit, which is a second query per dog on the busiest screen in
 *   the salon.
 * - A mean is the wrong number anyway. A dog on a settled 6-weekly
 *   rhythm that had one 6-month gap two years ago averages out at
 *   something nobody recognises, and the question at the counter is
 *   "when were they last in and when are they back", not "what is the
 *   long-run mean".
 *
 * So: weeks since the last visit, weeks until the next. If those two
 * agree the dog is on a rhythm and it is obvious at a glance; if they
 * disagree, that is the interesting thing and an average would have
 * hidden it.
 */
import { gapInWeeks } from "./rebook";

export type VisitRhythm = {
  /** Whole weeks between the previous visit and this one. Null if unknown. */
  sinceLastWeeks: number | null;
  /** Whole weeks between this visit and the next booking. Null if none. */
  untilNextWeeks: number | null;
  /**
   * Both gaps agree, so the dog is on a settled rhythm.
   *
   * False whenever either is missing: a dog with no history and one
   * future booking is not "on a rhythm", it has been booked once.
   */
  settled: boolean;
};

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function visitRhythm(input: {
  last?: Date | string | number | null;
  current: Date | string | number;
  next?: Date | string | number | null;
}): VisitRhythm {
  const current = toDate(input.current);
  const last = toDate(input.last);
  const next = toDate(input.next);
  if (!current) return { sinceLastWeeks: null, untilNextWeeks: null, settled: false };

  /*
   * Only count a gap in the direction it is meant to run. Imported
   * history has rows out of order, and a "last visit" that is actually
   * in the future would otherwise print a negative number of weeks.
   */
  const sinceLastWeeks = last && last.getTime() < current.getTime()
    ? gapInWeeks(last, current)
    : null;
  const untilNextWeeks = next && next.getTime() > current.getTime()
    ? gapInWeeks(current, next)
    : null;

  return {
    sinceLastWeeks,
    untilNextWeeks,
    settled:
      sinceLastWeeks !== null
      && untilNextWeeks !== null
      && sinceLastWeeks === untilNextWeeks,
  };
}

/** "6 weeks", "1 week", "same day". For a chip beside a date. */
export function describeWeeks(weeks: number | null): string | null {
  if (weeks === null) return null;
  if (weeks <= 0) return "same day";
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}
