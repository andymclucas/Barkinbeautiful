/**
 * Revenue targets for each staff member, and how they read over a day, a
 * week, a month or a quarter.
 *
 * One number is stored per person, with the period it is expressed in, and
 * every other view is scaled from it. The alternative — four targets per
 * person — is four numbers to keep in step, and they drift.
 *
 * Scaling is by CALENDAR DAYS, and the month and quarter lengths are the
 * real ones rather than 30 and 90. A February target that quietly assumed
 * 30 days would be 7% wrong every year.
 */

export const TARGET_PERIODS = ["daily", "weekly", "monthly", "quarterly"] as const;
export type TargetPeriod = (typeof TARGET_PERIODS)[number];

export const TARGET_PERIOD_LABELS: Record<TargetPeriod, string> = {
  daily: "Day",
  weekly: "Week",
  monthly: "Month",
  quarterly: "Quarter",
};

export function isTargetPeriod(value: unknown): value is TargetPeriod {
  return typeof value === "string" && (TARGET_PERIODS as readonly string[]).includes(value);
}

/** Whole days in a window, both ends inclusive. */
export function daysInRange(from: Date, to: Date): number {
  const ms = startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * How many days the stored period covers, around a given date.
 *
 * Month and quarter depend on WHICH month — 28 to 31, and 90 to 92 — so the
 * date matters. Passing the start of the window being viewed keeps a
 * February target honest.
 */
export function periodDays(period: TargetPeriod, reference: Date = new Date()): number {
  switch (period) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "monthly":
      return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0)).getUTCDate();
    case "quarterly": {
      const firstMonthOfQuarter = Math.floor(reference.getUTCMonth() / 3) * 3;
      const start = Date.UTC(reference.getUTCFullYear(), firstMonthOfQuarter, 1);
      const end = Date.UTC(reference.getUTCFullYear(), firstMonthOfQuarter + 3, 1);
      return Math.round((end - start) / 86_400_000);
    }
  }
}

/**
 * The target for a window of N days, scaled from however it was stored.
 *
 * Returns null when no target has been set. NULL is not zero: a zero target
 * would put every groomer at 100% of nothing, which looks like success.
 */
export function targetForDays(
  amount: string | number | null | undefined,
  period: TargetPeriod,
  days: number,
  reference: Date = new Date(),
): number | null {
  if (amount === null || amount === undefined || String(amount).trim() === "") return null;
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return null;

  const perPeriod = periodDays(period, reference);
  if (perPeriod <= 0) return null;
  return round2((value / perPeriod) * Math.max(1, days));
}

/** Whether the viewed figure is the number somebody typed, or scaled from it. */
export function isDerivedView(period: TargetPeriod, viewing: TargetPeriod): boolean {
  return period !== viewing;
}

export type TargetProgress = {
  /** What they brought in. */
  actual: number;
  /** What they were aiming at over the same window, or null if none is set. */
  target: number | null;
  /** 0–∞, or null with no target. 1 is exactly on target. */
  ratio: number | null;
  /** Positive is ahead, negative is behind. Null with no target. */
  difference: number | null;
  status: "no_target" | "ahead" | "on_track" | "behind";
};

/**
 * Within 5% counts as on track.
 *
 * A groomer $12 short of a $2,000 week has not missed anything, and
 * colouring that red every Friday teaches people to ignore the colour.
 */
export const ON_TRACK_TOLERANCE = 0.05;

export function targetProgress(actual: number, target: number | null): TargetProgress {
  if (target === null || target <= 0) {
    return { actual: round2(actual), target, ratio: null, difference: null, status: "no_target" };
  }
  const ratio = actual / target;
  const difference = round2(actual - target);
  const status = ratio >= 1 + ON_TRACK_TOLERANCE
    ? "ahead"
    : ratio >= 1 - ON_TRACK_TOLERANCE
      ? "on_track"
      : "behind";
  return { actual: round2(actual), target: round2(target), ratio, difference, status };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The window the staff tab compares over: the start of the period up to
 * TODAY, not the whole period.
 *
 * Comparing a full month's target against revenue banked so far would show
 * every groomer behind for twenty-nine days and on target on the thirtieth.
 * Period-to-date against a target scaled to the SAME number of days is the
 * only version of "ahead or behind" that means anything on a Tuesday.
 *
 * Dates are Brisbane calendar dates as YYYY-MM-DD, and the week starts on
 * Monday because the salon's does.
 */
export function rangeForPeriod(
  period: TargetPeriod,
  today: string,
): { from: string; to: string } {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  switch (period) {
    case "daily":
      return { from: today, to: today };
    case "weekly": {
      // getUTCDay: 0 is Sunday, so Monday is 1 and Sunday needs 6 taken off.
      const weekday = date.getUTCDay();
      const backToMonday = weekday === 0 ? 6 : weekday - 1;
      const monday = new Date(date.getTime() - backToMonday * 86_400_000);
      return { from: isoDate(monday), to: today };
    }
    case "monthly":
      return { from: isoDate(new Date(Date.UTC(year, month - 1, 1))), to: today };
    case "quarterly": {
      const firstMonthOfQuarter = Math.floor((month - 1) / 3) * 3;
      return { from: isoDate(new Date(Date.UTC(year, firstMonthOfQuarter, 1))), to: today };
    }
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date in the salon's timezone, as YYYY-MM-DD. */
export function brisbaneToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
