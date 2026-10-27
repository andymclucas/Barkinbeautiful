/**
 * What one membership groom is worth, as revenue.
 *
 * The day panel can say how many dogs are covered but not what that
 * work earned, because a covered groom carries no price — the money
 * arrives as a weekly debit instead. This converts the debit into a
 * per-visit figure so a day full of membership dogs stops reading as a
 * day that earned nothing.
 *
 * **weekly rate x weeks between grooms.** A Silver client paying
 * $23.78 a week and groomed every six weeks brings $142.68 of
 * subscription revenue to each visit. That is real money the salon
 * receives, spread over time, as opposed to the catalogue price, which
 * is money it deliberately does NOT charge. The two answer different
 * questions and only one of them belongs beside "Taken".
 *
 * **The cadence comes from the TIER**, because
 * `memberships.appointment_interval_weeks` is NULL on all 151 active
 * memberships. The column exists and was never filled in, so the tier
 * is the only cadence in the data.
 *
 * **Attributed per MEMBERSHIP, never per dog.** 27 of the 151 active
 * plans are multi-dog — one row, one fee, a household of two or three
 * dogs — and the count lives only in the plan's NAME, which
 * `nameLooksMultiDog` says is for blocking and never for pricing.
 * Summing per dog would bill a three-dog household's fee three times.
 * Counting each membership once sidesteps that entirely: the fee is
 * per plan, so the plan is the unit.
 */

import { intervalWeeksForTier } from "./membershipPackages";

export type ValuableMembership = {
  /** The plan, which is the unit of revenue. */
  membershipId: number;
  /** Always the WEEKLY rate, whatever billingCycle says. */
  pricePerCycle?: string | number | null;
  tier?: string | null;
};

const weekly = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Subscription revenue carried by one visit on this plan, in cents. */
export function visitValueCents(membership: ValuableMembership): number {
  const rate = weekly(membership.pricePerCycle);
  if (rate === 0) return 0;
  return Math.round(rate * 100) * intervalWeeksForTier(membership.tier);
}

/**
 * What the memberships on a day's board are worth between them.
 *
 * Deduplicated by membership id, so a household whose two dogs come on
 * the same day counts its one fee once.
 */
export function membershipVisitValueCents(memberships: readonly ValuableMembership[]): number {
  const seen = new Map<number, ValuableMembership>();
  for (const membership of memberships) {
    if (membership.membershipId == null) continue;
    if (!seen.has(membership.membershipId)) seen.set(membership.membershipId, membership);
  }
  let cents = 0;
  for (const membership of Array.from(seen.values())) cents += visitValueCents(membership);
  return cents;
}
