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

/**
 * The run-up, as UTC midnights standing for local calendar dates:
 * 1 November up to and including Christmas Eve.
 *
 * It starts on 1 November because that is when the salon's Christmas
 * rush starts filling up, and ends on the 24th because nobody is
 * grooming on Christmas Day. Both are the same in any country that
 * keeps Christmas, which is what makes this safe to ship to a second
 * salon.
 */
/**
 * The picture on the countdown, served from client/public.
 *
 * Andy, 02/11/2026: "Use this image for the Christmas countdown."
 *
 * Named here rather than typed into the card and the page separately,
 * because two copies of a path is how one of them ends up pointing at
 * a file that was renamed. It is a root-relative URL, not an import,
 * so swapping the picture is dropping a file in — no rebuild of a
 * hashed asset name, and no bundler involved.
 */
export const COUNTDOWN_IMAGE = "/christmas-countdown-dog.webp";

export function christmasSeason(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 10, 1)),
    end: new Date(Date.UTC(year, 11, 24)),
  };
}

/**
 * The season a day belongs to, or null outside it.
 *
 * Takes the SALON'S calendar day as "YYYY-MM-DD", never an instant.
 * A Date read in UTC puts Brisbane's first ten hours of 1 November on
 * 31 October, so the countdown would stay hidden for most of the
 * morning it was meant to start — and a salon west of Greenwich would
 * have the mirror image of the same bug. Who converts an instant into
 * a local day is the caller's business, because which timezone that is
 * belongs to the salon, not to this rule.
 *
 * A day in January belongs to NO season rather than to the one that
 * just finished: the countdown is over, and showing "0 to go" for ten
 * months is clutter nobody reads.
 */
export function seasonYearFor(localDay: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(localDay ?? "").trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month === 11) return year;
  if (month === 12 && day <= 24) return year;
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
  /** The salon's calendar day, "YYYY-MM-DD". */
  today: string;
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

  const [y, mo, d] = input.today.split("-").map(Number);
  const startOfDay = Date.UTC(y, mo - 1, d);
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
