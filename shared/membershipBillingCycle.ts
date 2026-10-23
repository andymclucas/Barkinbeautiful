/**
 * Weekly and monthly membership rates, and the conversion between them.
 *
 * The whole module exists for one number. A month is NOT four weeks: a
 * year holds 52 weeks but only 12 months, so the monthly equivalent of a
 * weekly rate is `weekly x 52 / 12`, which is 4.3333..., not 4.
 *
 * Charging `weekly x 4` looks right on every individual invoice and gives
 * away four weeks of revenue a year. Measured against the live book on
 * 23/10/2026 — 153 active memberships at $4,100/week — that is $16,400 a
 * year, 7.7%, invisible in testing because no single charge looks wrong.
 *
 * So the conversion is here, as a pure function with tests, rather than
 * inline at a call site where the next person writes `* 4`.
 *
 * The WEEKLY rate stays the stored source of truth. A monthly figure is
 * derived from it on demand and never stored as an independent number,
 * because two stored rates drift the moment somebody edits one of them.
 */

/** Weeks in a billing year. 52 exactly — see WHY_NOT_52_1775 below. */
export const WEEKS_PER_YEAR = 52;
export const MONTHS_PER_YEAR = 12;

/**
 * Weekly -> monthly multiplier: 4.3333...
 *
 * A calendar year is 52.1775 weeks, not 52. Using 52 understates the
 * monthly rate by about 0.34% — roughly $730 a year across the current
 * book. It is still the right choice: 52 is the number the salon already
 * prices in, every weekly rate was set as "x per week, 52 times", and a
 * monthly rate derived from 52.1775 cannot be multiplied back to a clean
 * weekly one. Consistency between the two beats astronomical accuracy.
 */
export const WEEKLY_TO_MONTHLY = WEEKS_PER_YEAR / MONTHS_PER_YEAR;

export type MonthlyRounding = "cent" | "dollar" | "dollar_up";

const toCents = (amount: string | number | null | undefined): number => {
  const n = typeof amount === "number" ? amount : Number(String(amount ?? "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const fromCents = (cents: number): string => (cents / 100).toFixed(2);

/**
 * The monthly rate equivalent to a weekly one.
 *
 * Returns null for anything unusable rather than "0.00", so a missing
 * price cannot silently become a free membership.
 */
export function weeklyToMonthly(
  weekly: string | number | null | undefined,
  rounding: MonthlyRounding = "cent",
): string | null {
  const weeklyCents = toCents(weekly);
  if (weeklyCents <= 0) return null;
  const exact = weeklyCents * WEEKLY_TO_MONTHLY;
  switch (rounding) {
    case "dollar": return fromCents(Math.round(exact / 100) * 100);
    case "dollar_up": return fromCents(Math.ceil(exact / 100) * 100);
    default: return fromCents(Math.round(exact));
  }
}

/** The weekly rate a monthly one came from. The inverse of the above. */
export function monthlyToWeekly(monthly: string | number | null | undefined): string | null {
  const monthlyCents = toCents(monthly);
  if (monthlyCents <= 0) return null;
  return fromCents(Math.round(monthlyCents / WEEKLY_TO_MONTHLY));
}

/**
 * What a rate costs over a year, whichever cycle it is billed on.
 *
 * This is the number to compare when anyone asks "is the client paying
 * the same?" — comparing a weekly rate to a monthly one directly is the
 * mistake this module exists to prevent.
 */
export function annualisedCost(
  rate: string | number | null | undefined,
  cycle: BillingCycle,
): string | null {
  const cents = toCents(rate);
  if (cents <= 0) return null;
  return fromCents(Math.round(cents * (cycle === "monthly" ? MONTHS_PER_YEAR : WEEKS_PER_YEAR)));
}

export type BillingCycle = "weekly" | "monthly";

/** How a rate reads to a human, e.g. "$65.00/month". */
export function describeRate(rate: string | number | null | undefined, cycle: BillingCycle): string {
  const cents = toCents(rate);
  if (cents <= 0) return "unpriced";
  return `$${fromCents(cents)}/${cycle === "monthly" ? "month" : "week"}`;
}

/**
 * What switching cycle does to the client's yearly outlay.
 *
 * `differenceCents` is what the salon gains (positive) or gives away
 * (negative) over a year. A correct conversion is 0 or a rounding cent;
 * anything larger means the rate was not derived from the weekly one.
 */
export function switchImpact(
  weekly: string | number | null | undefined,
  rounding: MonthlyRounding = "cent",
): { monthly: string; annualBefore: string; annualAfter: string; differenceCents: number } | null {
  const monthly = weeklyToMonthly(weekly, rounding);
  if (monthly === null) return null;
  const before = annualisedCost(weekly, "weekly");
  const after = annualisedCost(monthly, "monthly");
  if (before === null || after === null) return null;
  return {
    monthly, annualBefore: before, annualAfter: after,
    differenceCents: toCents(after) - toCents(before),
  };
}
