/**
 * How often a membership's payment has been declined, ever.
 *
 * Lauren, 26/11/2026: "I think we need to record how many times it
 * happens." The failed-payment count on a membership is the CURRENT run
 * only: it goes back to 0 the moment a payment succeeds, so a member who
 * declines most weeks and pays on the retry always looks like a first
 * offender. Every decline already writes a `failed` row to
 * membership_payments and nothing deletes them, so the lifetime count is
 * read from those rows rather than kept in a new column.
 *
 * Every failed row counts, a staff-pressed retry included: the card was
 * declined, which is what staff want to know about.
 */

export type DeclineRow = {
  membershipId: number;
  createdAt: Date | string | null;
};

export type DeclineHistory = {
  /** Every declined payment on record. */
  total: number;
  /** The first one, so "since" can be said. */
  firstAt: Date | null;
  /** The most recent one. */
  lastAt: Date | null;
};

export const NO_DECLINES: DeclineHistory = { total: 0, firstAt: null, lastAt: null };

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One history per membership, from its failed payment rows in any order. */
export function declineHistoryByMembership(rows: ReadonlyArray<DeclineRow>): Map<number, DeclineHistory> {
  const out = new Map<number, DeclineHistory>();
  for (const row of rows) {
    const at = toDate(row.createdAt);
    const h = out.get(row.membershipId) ?? { total: 0, firstAt: null, lastAt: null };
    h.total += 1;
    if (at && (!h.firstAt || at < h.firstAt)) h.firstAt = at;
    if (at && (!h.lastAt || at > h.lastAt)) h.lastAt = at;
    out.set(row.membershipId, h);
  }
  return out;
}

/**
 * "Declined 4 times since 3 Sep", "Declined once, on 3 Sep", or null when
 * it never has. The year is added only when the first decline was in an
 * earlier year than `now`.
 */
export function describeDeclineHistory(
  history: DeclineHistory | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): string | null {
  if (!history || history.total <= 0) return null;
  const first = history.firstAt;
  const yearOf = (d: Date) => new Intl.DateTimeFormat("en-AU", { year: "numeric", timeZone }).format(d);
  const day = first
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        ...(yearOf(first) !== yearOf(now) ? { year: "numeric" as const } : {}),
        timeZone,
      }).format(first)
    : null;
  if (history.total === 1) return day ? `Declined once, on ${day}` : "Declined once";
  return day ? `Declined ${history.total} times since ${day}` : `Declined ${history.total} times`;
}
