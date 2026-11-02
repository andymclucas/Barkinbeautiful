/**
 * How many dogs there are between the salon and Christmas.
 *
 * Andy, 02/11/2026, with a screenshot of MoeGo's "498 pets to groom till
 * Thanksgiving": "add something like this for Christmas in Groomigo."
 *
 * Thanksgiving is MoeGo's American default and means nothing here;
 * Christmas is the one that matters, and the run-up to it is the
 * hardest few weeks of the salon's year. The number staff want on the
 * wall is how many dogs are still between them and the break.
 *
 * Pure, and deliberately ignorant of how the counts were reached, so
 * the rule can be read and tested without a database.
 */

/** Christmas Day in a given year, as a local calendar date. */
export const CHRISTMAS_DAY = { month: 12, day: 25 } as const;

/**
 * The run-up, as local dates: 1 November up to and including Christmas Eve.
 *
 * It starts on 1 November because that is when the salon's Christmas
 * rush starts filling up, and ends on the 24th because nobody is
 * grooming on Christmas Day. Both are the same in any country that
 * keeps Christmas, which is what makes this safe to ship to a second
 * salon.
 */
export function christmasSeason(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 10, 1)),
    end: new Date(Date.UTC(year, 11, 24)),
  };
}

/**
 * The season a date belongs to, or null outside it.
 *
 * A date in January belongs to NO season rather than to the one that
 * just finished: the countdown is over, and showing "0 to go" for ten
 * months is clutter nobody reads.
 */
export function seasonYearFor(today: Date): number | null {
  const month = today.getUTCMonth();
  if (month === 10) return today.getUTCFullYear();
  if (month === 11 && today.getUTCDate() <= 24) return today.getUTCFullYear();
  return null;
}

export type ChristmasCountdown = {
  /** Dogs still booked between now and Christmas Eve. */
  remaining: number;
  /** Dogs already groomed since the season started. */
  completed: number;
  /** completed / (completed + remaining), 0-100, rounded. */
  percent: number;
  /** Whole days from today to Christmas Eve; 0 on the day itself. */
  daysLeft: number;
  /** The last date dogs are counted up to. */
  until: Date;
};

export function christmasCountdown(input: {
  today: Date;
  completed: number;
  remaining: number;
}): ChristmasCountdown | null {
  const year = seasonYearFor(input.today);
  if (year === null) return null;

  const { end } = christmasSeason(year);
  const completed = Math.max(0, Math.trunc(input.completed));
  const remaining = Math.max(0, Math.trunc(input.remaining));
  const total = completed + remaining;

  /* A salon with nothing booked and nothing done is at 0%, not 100%.
     Dividing by zero would read as "all finished" on the quietest
     possible day, which is the opposite of the truth. */
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  const startOfDay = Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth(), input.today.getUTCDate());
  const daysLeft = Math.max(0, Math.round((end.getTime() - startOfDay) / 86_400_000));

  return { remaining, completed, percent, daysLeft, until: end };
}

/** "498 pets to groom till Christmas", or the singular when it is one. */
export function countdownHeadline(count: number): string {
  return `${count === 1 ? "pet" : "pets"} to groom till Christmas`;
}

/** The small line under the bar. Says something useful on the last day. */
export function countdownSubtitle(c: ChristmasCountdown): string {
  if (c.remaining === 0) return `${c.completed.toLocaleString()} groomed — that's the lot`;
  if (c.daysLeft === 0) return `${c.completed.toLocaleString()} groomed — last day before Christmas`;
  return `${c.completed.toLocaleString()} groomed · ${c.daysLeft} ${c.daysLeft === 1 ? "day" : "days"} to go`;
}
