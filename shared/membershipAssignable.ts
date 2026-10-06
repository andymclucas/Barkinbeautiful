/**
 * The memberships a dog can actually be put on.
 *
 * There have been two membership systems and only one of them worked.
 *
 * `MEMBERSHIP_PACKAGES` is a hardcoded cross-product — five tiers, two
 * service types, six weight bands — and it is what the "put this dog on a
 * membership" flow reads. `membership_plans` is a real table with a
 * Pricing screen behind it, 48 rows, and an appointment_interval_weeks
 * column. Nothing in the assignment path ever looked at it.
 *
 * So a salon could create a plan and then not find it anywhere. Which is
 * what blocks a client wanting a five-weekly styled clip called
 * "Silver +": the interval is not one of the built-in schedules and the
 * name is not one of the five tiers.
 *
 * This is the shape both become, so the picker can offer them together
 * and the assignment can resolve either.
 */

import type { MembershipPackage, MembershipWeightClass } from "./membershipPackages";

export type AssignablePackage = {
  /** Built-ins keep their own id; a custom plan is "plan:<row id>". */
  id: string;
  name: string;
  /** Free text for a custom plan — "Silver +" is not one of the five tiers. */
  tier: string;
  serviceType: string;
  /** Null means the plan is not restricted to a weight band. */
  weightClass: MembershipWeightClass | string | null;
  weeklyPrice: number;
  appointmentIntervalWeeks: number;
  visitsPerYear: string;
  /** True for a plan the salon created itself. */
  custom: boolean;
};

export const CUSTOM_PLAN_ID_PREFIX = "plan:";

/** The row id behind a custom package id, or null if it is a built-in. */
export function customPlanId(packageId: string): number | null {
  if (!packageId.startsWith(CUSTOM_PLAN_ID_PREFIX)) return null;
  const n = Number(packageId.slice(CUSTOM_PLAN_ID_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Roughly how many grooms a year an interval buys.
 *
 * Deliberately a floor, not a round: a five-weekly membership delivers
 * ten grooms in a year, not 10.4, and quoting a fraction of a groom to a
 * client reads as a mistake.
 */
export function visitsPerYearFor(intervalWeeks: number): string {
  if (!Number.isFinite(intervalWeeks) || intervalWeeks <= 0) return "—";
  const visits = Math.floor(52 / intervalWeeks);
  return `${visits} grooms a year`;
}

export function fromBuiltIn(pkg: MembershipPackage): AssignablePackage {
  return {
    id: pkg.id,
    name: pkg.name,
    tier: pkg.tier,
    serviceType: pkg.serviceType,
    weightClass: pkg.weightClass,
    weeklyPrice: pkg.weeklyPrice,
    appointmentIntervalWeeks: pkg.appointmentIntervalWeeks,
    visitsPerYear: pkg.visitsPerYear,
    custom: false,
  };
}

export type MembershipPlanRow = {
  id: number;
  name: string;
  tier: string;
  serviceVariant?: string | null;
  weightBand?: string | null;
  weeklyPriceAud: string | number;
  appointmentIntervalWeeks: number;
  isActive?: boolean | null;
};

export function fromPlan(plan: MembershipPlanRow): AssignablePackage {
  const price = typeof plan.weeklyPriceAud === "number" ? plan.weeklyPriceAud : Number(plan.weeklyPriceAud);
  return {
    id: `${CUSTOM_PLAN_ID_PREFIX}${plan.id}`,
    name: plan.name,
    tier: plan.tier,
    serviceType: plan.serviceVariant?.trim() || "classic",
    // No weight band means the plan suits any dog, which is the point of
    // a bespoke one — it was written for a particular client's dogs.
    weightClass: plan.weightBand?.trim() || null,
    weeklyPrice: Number.isFinite(price) ? price : 0,
    appointmentIntervalWeeks: plan.appointmentIntervalWeeks,
    visitsPerYear: visitsPerYearFor(plan.appointmentIntervalWeeks),
    custom: true,
  };
}

/**
 * What to offer for a dog of this weight.
 *
 * A custom plan with no weight band is offered whatever the dog weighs —
 * a bespoke plan was written for particular dogs, and refusing it because
 * it does not name a band would hide the only plan that fits.
 *
 * Custom plans come first. A salon that has written its own has done so
 * for a reason, and burying it under thirty built-ins is unhelpful.
 */
export function assignablePackagesFor(
  builtIns: MembershipPackage[],
  plans: MembershipPlanRow[],
  weightClass: MembershipWeightClass | null,
): AssignablePackage[] {
  const offered = builtIns.map(fromBuiltIn);

  // The seeded membership_plans rows mirror the built-in packages one for
  // one — 48 of them. Offering both shows every membership twice, which
  // is exactly how this looked the first time it ran against real data: a
  // 42kg dog was offered seventeen packages, nine of them duplicates.
  //
  // So a plan is offered only when it is genuinely something new. Matched
  // on tier, service and weight band rather than on name, because a salon
  // renaming a seeded plan has not created a different membership.
  const duplicatesBuiltIn = (p: AssignablePackage) => offered.some(b =>
    b.tier === p.tier && b.serviceType === p.serviceType && b.weightClass === p.weightClass);

  const custom = plans
    .filter(p => p.isActive !== false)
    .map(fromPlan)
    .filter(p => p.weightClass === null || weightClass === null || p.weightClass === weightClass)
    .filter(p => !duplicatesBuiltIn(p));

  return [...custom, ...offered];
}

/**
 * The tiers a membership row can actually hold.
 *
 * memberships.tier is a MySQL enum, so a custom plan's tier has to be one
 * of these. That is not the limitation it looks like: the tier is the
 * billing and benefit class, and `name` — a plain varchar — is what the
 * client is sold. Lauren's "Silver +" is a silver membership on a
 * five-weekly schedule, and that is exactly how it stores: tier "silver",
 * name "Silver +".
 *
 * Widening the enum would rewrite a live column holding 154 active
 * memberships to buy nothing a name does not already give.
 */
export const STORABLE_TIERS = ["diamond", "platinum", "gold", "silver", "bronze"] as const;
export const STORABLE_SERVICE_TYPES = ["classic", "styled"] as const;

export type TierValidation = { ok: true } | { ok: false; reason: string };

/** Can this plan actually be put on a dog? */
export function validatePlanForAssignment(pkg: { name: string; tier: string; serviceType: string }): TierValidation {
  if (!(STORABLE_TIERS as readonly string[]).includes(pkg.tier)) {
    return {
      ok: false,
      reason: `"${pkg.name}" has a tier of "${pkg.tier}", which is not one of ${STORABLE_TIERS.join(", ")}. `
        + `Set the plan's tier to the closest of those — the plan's NAME is what the client sees, `
        + `so a five-weekly silver plan can still be called anything you like.`,
    };
  }
  if (!(STORABLE_SERVICE_TYPES as readonly string[]).includes(pkg.serviceType)) {
    return {
      ok: false,
      reason: `"${pkg.name}" has a service type of "${pkg.serviceType}", which must be classic or styled.`,
    };
  }
  return { ok: true };
}
