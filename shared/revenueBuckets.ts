/**
 * Bucketing the revenue trend chart.
 *
 * Extracted from `analyticsExt.revenueTimeSeries` after it spent an
 * unknown length of time drawing a flat $0 line for appointment revenue
 * on every range of 31 days or fewer.
 *
 * The bug was one character of arithmetic. A bucket ran from `cursor` to
 * `cursor + bucketDays - 1` DAYS and matched rows with
 * `start >= cursor && start <= bucketEnd`. For a daily bucket that is
 * `cursor + 0 days`, so the window was a single instant — midnight — and
 * matched only an appointment starting exactly then. For 1–19 Oct 2026
 * the query fetched 175 rows worth $23,349.50 and the buckets kept $200.
 *
 * Nothing caught it because the chart still rendered: membership revenue
 * is a projection computed per bucket and was unaffected, so the card
 * looked alive. Buckets are a half-open interval now, [start, end), and
 * tested.
 */

export type BucketableRow = {
  /** When the appointment is scheduled. Rows with no date are skipped. */
  scheduledStart: Date | string | null | undefined;
  /** Decimal dollars as the database stores them. */
  price: string | number | null | undefined;
};

export type RevenueBucket = {
  label: string;
  apptRevenue: number;
  memberRevenue: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How wide a bucket should be for a range of this length.
 *
 * A year of daily bars is 365 marks in 900 pixels, which is a smear; a
 * fortnight of monthly ones is a single bar. These thresholds are the
 * ones the chart already used.
 */
export function bucketDaysFor(dateFrom: Date, dateTo: Date): number {
  const diffDays = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / DAY_MS);
  if (diffDays <= 31) return 1;
  if (diffDays <= 90) return 7;
  return 30;
}

/** Dollars a decimal column holds, as a number, with nonsense read as 0. */
function money(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function buildRevenueBuckets(input: {
  rows: readonly BucketableRow[];
  dateFrom: Date;
  dateTo: Date;
  /** Membership run-rate per day, spread evenly across the range. */
  dailyMemberRevenue: number;
  bucketDays?: number;
  /** Brisbane by default; the salon's clock, not the server's. */
  timeZone?: string;
}): RevenueBucket[] {
  const {
    rows, dateFrom, dateTo, dailyMemberRevenue,
    timeZone = "Australia/Brisbane",
  } = input;
  const bucketDays = input.bucketDays ?? bucketDaysFor(dateFrom, dateTo);
  if (!(dateTo.getTime() >= dateFrom.getTime()) || bucketDays < 1) return [];

  // Parsed once. The old version re-read every row's date on every
  // bucket, which is 365 x N for a year.
  const parsed = rows
    .map((r) => ({ at: asDate(r.scheduledStart), price: money(r.price) }))
    .filter((r): r is { at: Date; price: number } => r.at !== null);

  const buckets: RevenueBucket[] = [];
  const cursor = new Date(dateFrom);

  while (cursor.getTime() <= dateTo.getTime()) {
    // Half-open: [cursor, end). `end` is the START of the next bucket,
    // never "the last day of this one", which is what went wrong.
    const next = new Date(cursor);
    next.setDate(next.getDate() + bucketDays);
    // The final bucket stops at dateTo, inclusive of the instant itself.
    const end = next.getTime() > dateTo.getTime()
      ? new Date(dateTo.getTime() + 1)
      : next;

    const label = bucketDays === 1
      ? cursor.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone })
      : cursor.toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone });

    let apptRevenue = 0;
    for (const row of parsed) {
      const t = row.at.getTime();
      if (t >= cursor.getTime() && t < end.getTime()) apptRevenue += row.price;
    }

    // A part-day at the end of the range still counts as a day of
    // membership run-rate; a membership does not bill in fractions.
    const spanDays = Math.max(1, Math.ceil((end.getTime() - cursor.getTime()) / DAY_MS));

    buckets.push({
      label,
      apptRevenue: Math.round(apptRevenue * 100) / 100,
      memberRevenue: Math.round(dailyMemberRevenue * spanDays * 100) / 100,
    });
    cursor.setDate(cursor.getDate() + bucketDays);
  }
  return buckets;
}
