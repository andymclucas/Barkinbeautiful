/**
 * The period a report is compared against.
 *
 * Andy, 17/11/2026: "Add in a vs previous period in reporting too. Needs
 * to be previous period (if looking at weekly, then show previous week.
 * If looking at monthly, show previous month. If looking at yearly, show
 * previous year comparison)."
 *
 * Like for like, always. Week-to-date on a Wednesday is compared with
 * Monday to Wednesday of the week before, not with the whole of it: a
 * part-week set against a full one always looks like a bad week. The
 * same for month-to-date (the 1st to the same day of last month) and
 * year-to-date (1 January to the same date last year).
 *
 * Works in Brisbane calendar days ("YYYY-MM-DD"), never instants, so it
 * has no timezone in it. The caller turns the keys into the salon's day
 * boundaries (shared/localDateTime.ts, brisbaneExplicitRange).
 */
export type ReportRangeKind = "mtd" | "d30" | "wtd" | "d7" | "d90" | "ytd" | "y1" | "custom";

export type PreviousPeriod = {
  fromKey: string;
  toKey: string;
  /** "previous week", "previous month", "previous year", "previous 30 days". */
  name: string;
};

const DAY = 86_400_000;
const toUtc = (key: string) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (key: string, days: number) => toKey(toUtc(key) + days * DAY);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const pad = (n: number) => String(n).padStart(2, "0");

/** The same day of the month before, clamped: 31 March -> 28 February. */
function monthBefore(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${pad(pm)}-${pad(Math.min(d, daysInMonth(py, pm)))}`;
}

/** The same date a year before, clamped: 29 February -> 28 February. */
function yearBefore(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${y - 1}-${pad(m)}-${pad(Math.min(d, daysInMonth(y - 1, m)))}`;
}

const isWholeMonth = (fromKey: string, toKeyValue: string) => {
  const [y, m, d] = fromKey.split("-").map(Number);
  return d === 1 && toKeyValue === `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
};

const isWholeYear = (fromKey: string, toKeyValue: string) =>
  fromKey.slice(5) === "01-01" && toKeyValue === `${fromKey.slice(0, 4)}-12-31`;

export function previousReportPeriod(input: {
  kind: ReportRangeKind;
  fromKey: string;
  toKey: string;
  /** Today in Brisbane. A whole month or year still in progress is compared only up to today. */
  todayKey?: string;
}): PreviousPeriod {
  const { kind, fromKey } = input;
  // A reversed pair is read the right way round, as the range itself is.
  const [lo, hi] = fromKey <= input.toKey ? [fromKey, input.toKey] : [input.toKey, fromKey];
  const days = Math.round((toUtc(hi) - toUtc(lo)) / DAY) + 1;

  if (kind === "wtd") {
    return { fromKey: addDays(lo, -7), toKey: addDays(hi, -7), name: "previous week" };
  }
  if (kind === "mtd") {
    return { fromKey: monthBefore(lo), toKey: monthBefore(hi), name: "previous month" };
  }
  if (kind === "ytd") {
    return { fromKey: yearBefore(lo), toKey: yearBefore(hi), name: "previous year" };
  }
  if (kind === "custom") {
    // A whole calendar year or month picked by hand is still "yearly" or
    // "monthly": compare it with the whole one before.
    // ...unless it has not finished. The whole of this year against the
    // whole of last year, in November, is ten and a half months against
    // twelve; so an unfinished one is compared up to today's date, the
    // same as year-to-date and month-to-date.
    const today = input.todayKey;
    const unfinished = today !== undefined && lo <= today && today < hi;
    if (isWholeYear(lo, hi)) {
      if (unfinished) return { fromKey: yearBefore(lo), toKey: yearBefore(today), name: "previous year" };
      const y = Number(lo.slice(0, 4)) - 1;
      return { fromKey: `${y}-01-01`, toKey: `${y}-12-31`, name: "previous year" };
    }
    if (isWholeMonth(lo, hi)) {
      if (unfinished) return { fromKey: monthBefore(lo), toKey: monthBefore(today), name: "previous month" };
      const first = monthBefore(lo);
      const [y, m] = first.split("-").map(Number);
      return { fromKey: first, toKey: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`, name: "previous month" };
    }
  }
  // Rolling windows, and any other hand-picked range: the same number of
  // days, ending the day before this one starts.
  // The presets keep their own names: "Last 30 days" reaches back thirty
  // days from today and so spans thirty-one, and "previous 31 days" under
  // it would read as a different length. The dates are shown beside it.
  const nominal: Partial<Record<ReportRangeKind, string>> = {
    d7: "previous 7 days", d30: "previous 30 days", d90: "previous 90 days", y1: "previous 12 months",
  };
  const name = nominal[kind] ?? `previous ${days} day${days === 1 ? "" : "s"}`;
  return { fromKey: addDays(lo, -days), toKey: addDays(lo, -1), name };
}

export type ChangeVersus = {
  /** Up, down or level against the earlier figure. */
  direction: "up" | "down" | "flat";
  /** Whole-number-ish percentage change, always positive; null when there is nothing to divide by. */
  percent: number | null;
};

/**
 * How a figure moved against the earlier period.
 *
 * `percent` is null when the earlier figure is zero: "up from nothing" has
 * no honest percentage, and showing +100% or infinity for it reads as a
 * measurement.
 */
export function changeVersus(current: number, previous: number): ChangeVersus {
  const now = Number.isFinite(current) ? current : 0;
  const then = Number.isFinite(previous) ? previous : 0;
  const direction = now > then ? "up" : now < then ? "down" : "flat";
  if (then === 0) return { direction, percent: null };
  return { direction, percent: Math.round((Math.abs(now - then) / Math.abs(then)) * 1000) / 10 };
}

/**
 * A period that reaches back before revenue was being recorded.
 *
 * Andy, 17/11/2026: "Add the yearly warning to Reporting". Barkin'
 * Beautiful's bookings before August 2025 came across from the old system
 * without prices: January to July 2025 holds 4,526 bookings and $0. Set
 * against that, this year reads as revenue up 160%, which is not real.
 *
 * Nothing here knows that date. It compares the first day with any
 * booking against the first day with any revenue, both read from the
 * salon's own data, so it is right for any salon and goes quiet by
 * itself if the history is ever repriced. A salon whose revenue starts
 * with its bookings never sees it.
 *
 * Returns the day revenue starts, when the period begins before it;
 * otherwise null.
 */
export function revenueGapStart(input: {
  periodFromKey: string;
  bookingsFrom: string | null | undefined;
  revenueRecordedFrom: string | null | undefined;
}): string | null {
  const { periodFromKey, bookingsFrom, revenueRecordedFrom } = input;
  const key = /^\d{4}-\d{2}-\d{2}$/;
  if (!bookingsFrom || !revenueRecordedFrom) return null;
  if (!key.test(bookingsFrom) || !key.test(revenueRecordedFrom) || !key.test(periodFromKey)) return null;
  // Revenue from the first booking on: there is no gap to warn about.
  if (revenueRecordedFrom <= bookingsFrom) return null;
  return periodFromKey < revenueRecordedFrom ? revenueRecordedFrom : null;
}
