/**
 * The period a report compares itself against.
 *
 * Two questions a salon actually asks, and they are not the same one:
 *
 *   "prior_period"  — is this month better than last month?
 *   "prior_year"    — is this October better than last October?
 *
 * Month-on-month flatters or punishes a seasonal business: a grooming salon
 * is busy before Christmas and quiet in January, so December always beats
 * November and January always looks like a collapse. Year-on-year is the one
 * that says whether the business is growing.
 *
 * Pure, because the arithmetic has corners — a 31-day month against a 30-day
 * one, and 29 February — and those are worth testing without a database.
 */

export type ComparisonMode = "prior_period" | "prior_year";

export const COMPARISON_LABELS: Record<ComparisonMode, string> = {
  prior_period: "vs prior period",
  prior_year: "vs same period last year",
};

/** Whole days between two instants, inclusive of both ends. */
export function inclusiveDayCount(from: Date, to: Date): number {
  const ms = startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * The range to compare {from, to} against.
 *
 * `prior_period` is the same number of days ending the day before `from`, so
 * the two series are the same length and line up index for index on a chart.
 *
 * `prior_year` subtracts one year from both ends. 29 February has no
 * counterpart in a common year, and `Date` would roll it forward to 1 March
 * silently; it is clamped to 28 February instead, which is the day a person
 * means when they say "this date last year".
 */
export function comparisonRange(
  from: Date,
  to: Date,
  mode: ComparisonMode,
): { from: Date; to: Date } {
  if (mode === "prior_year") {
    return { from: shiftYears(from, -1), to: shiftYears(to, -1) };
  }
  const days = inclusiveDayCount(from, to);
  const priorTo = new Date(startOfUtcDay(from).getTime() - 86_400_000);
  const priorFrom = new Date(priorTo.getTime() - (days - 1) * 86_400_000);
  // Carry the original times of day, so a range built from local midnights
  // compares against local midnights rather than drifting by the offset.
  return {
    from: withTimeOf(priorFrom, from),
    to: withTimeOf(priorTo, to),
  };
}

function shiftYears(d: Date, years: number): Date {
  const year = d.getUTCFullYear() + years;
  const month = d.getUTCMonth();
  const day = Math.min(d.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(Date.UTC(year, month, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function withTimeOf(day: Date, source: Date): Date {
  return new Date(Date.UTC(
    day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(),
    source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds(),
  ));
}

/**
 * Percentage change, as a report would print it.
 *
 * Returns null rather than Infinity when the comparison period earned
 * nothing: "up ∞%" against a zero baseline is not information, and a salon
 * that was closed last January should not read as infinite growth.
 */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
