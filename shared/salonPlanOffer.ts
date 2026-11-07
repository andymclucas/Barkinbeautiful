/**
 * What a salon is being offered, in the words they should read.
 *
 * Three sources already hold the facts — `PLAN_LABELS` and
 * `PLAN_FEATURES` in planEntitlements, `SMS_QUOTA_BY_PLAN` in
 * smsMetering — and the billing screen needs all three per plan. Doing
 * that join in the component is how the Settings page ends up claiming
 * a feature the entitlement check does not actually grant.
 *
 * ## No price, deliberately
 *
 * There is no `priceAud` here and there should not be. Stripe holds the
 * price: `priceIdForPlan` reads a `STRIPE_PRICE_*` id from the
 * environment, and Checkout shows the salon the real figure before they
 * type a card. A number copied into this file would be a second source
 * of truth for money, free to drift from what the card is actually
 * charged — and the one direction that error runs is quoting a salon
 * less than they are billed.
 *
 * So the screen names the plan and what it includes, and lets Stripe
 * state the price. The design proposal left its price cells blank for
 * the same reason, in its own words: "inventing them is not mine to do."
 */

import {
  PLAN_LABELS, PLAN_FEATURES, FEATURE_LABELS, type Plan,
} from "./planEntitlements";
import { SMS_QUOTA_BY_PLAN } from "./smsMetering";

/**
 * Generic in the plan so a caller that already knows which plans it has
 * keeps that knowledge. `purchasablePlans` is the three buyable ones and
 * never "trial"; widening them back to `Plan` here would make the
 * Subscribe button's handler accept a plan nobody can buy.
 */
export type SalonPlanOffer<P extends Plan = Plan> = {
  plan: P;
  /** The plan's name as the salon sees it, e.g. "Complete, with Workflow". */
  label: string;
  /** What the plan actually entitles them to, from PLAN_FEATURES. */
  includes: readonly string[];
  /** Texts per month included in the fee. Zero is a real answer. */
  smsIncluded: number;
  /**
   * That allowance as a sentence, because "0" in a feature list reads
   * like a mistake rather than a deliberate tier. Starter really does
   * include none.
   */
  smsLabel: string;
};

export function salonPlanOffer<P extends Plan>(plan: P): SalonPlanOffer<P> {
  const smsIncluded = SMS_QUOTA_BY_PLAN[plan] ?? 0;
  return {
    plan,
    label: PLAN_LABELS[plan],
    includes: PLAN_FEATURES[plan].map((feature) => FEATURE_LABELS[feature]),
    smsIncluded,
    smsLabel: smsIncluded > 0
      ? `${smsIncluded.toLocaleString("en-AU")} client texts a month included`
      : "Client texts charged separately",
  };
}
