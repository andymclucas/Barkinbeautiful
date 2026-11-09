/**
 * Types for populateApprovedPricingCatalogue.mjs.
 *
 * The seed itself stays `.mjs` because it is run directly with node and
 * nothing imports it at build time. `server/approvedPricingCatalogue.test.ts`
 * does import it, though, and once `**\/*.test.ts` came inside `tsc` that
 * import was an implicit `any` -- which meant the test's own assertions
 * about `priceMode` and `priceAud` were being checked against nothing.
 *
 * Declared here rather than by converting the seed, so the file that runs
 * against the database is left exactly as it was verified.
 */

export declare const APPROVED_PRICE_LIST_SOURCE: string;
export declare const APPROVED_PRICE_LIST_URL: string;

/** One row of pricing_catalogue, as the seed builds it. */
export type ApprovedPricingService = {
  catalogueType: "service" | "add_on";
  code: string;
  name: string;
  priceMode: "fixed" | "range" | "from" | "quote";
  priceAud: number | null;
  priceMaxAud: number | null;
  durationMinutes: number | null;
  weightBand: string | null;
  legacyServiceType: string | null;
  sortOrder: number;
  description: string | null;
};

/** One row of membership_packages, as the seed builds it. */
export type ApprovedMembershipPlan = {
  code: string;
  name: string;
  tier: string;
  serviceVariant: string;
  weightBand: string;
  weeklyPriceAud: number;
  billingCycleWeeks: number;
  appointmentIntervalWeeks: number;
  description: string;
  sortOrder: number;
};

export declare const APPROVED_PRICING_SERVICES: readonly ApprovedPricingService[];
export declare const APPROVED_MEMBERSHIP_PLANS: readonly ApprovedMembershipPlan[];
