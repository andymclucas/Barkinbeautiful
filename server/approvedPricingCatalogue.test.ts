import { describe, expect, it } from "vitest";
import { APPROVED_MEMBERSHIP_PLANS, APPROVED_PRICING_SERVICES } from "../scripts/populateApprovedPricingCatalogue.mjs";
import { MEMBERSHIP_PACKAGES, MEMBERSHIP_WEIGHT_BANDS } from "../shared/membershipPackages";

describe("approved Barkin Beautiful catalogue seed", () => {
  it("retains the verified fixed, range, from-price and quote-required service treatments", () => {
    expect(APPROVED_PRICING_SERVICES).toHaveLength(42);
    expect(APPROVED_PRICING_SERVICES.find((item) => item.code === "classic-large")).toMatchObject({ priceMode: "range", priceAud: 180, priceMaxAud: 200 });
    expect(APPROVED_PRICING_SERVICES.find((item) => item.code === "styled-large")).toMatchObject({ priceMode: "from", priceAud: 230 });
    expect(APPROVED_PRICING_SERVICES.find((item) => item.code === "hygiene-xlarge-long")).toMatchObject({ priceMode: "quote", priceAud: null });
    expect(APPROVED_PRICING_SERVICES.find((item) => item.code === "nails-clipped-and-filed")).toMatchObject({ catalogueType: "add_on", priceMode: "fixed", priceAud: 20 });
  });

  it("matches every existing verified weekly membership package without inventing a new plan", () => {
    expect(APPROVED_MEMBERSHIP_PLANS).toHaveLength(48);
    expect(APPROVED_MEMBERSHIP_PLANS.map((plan) => plan.code).sort()).toEqual(MEMBERSHIP_PACKAGES.map((plan) => plan.id).sort());
    for (const packageItem of MEMBERSHIP_PACKAGES) {
      const plan = APPROVED_MEMBERSHIP_PLANS.find((candidate) => candidate.code === packageItem.id);
      const band = MEMBERSHIP_WEIGHT_BANDS.find((candidate) => candidate.id === packageItem.weightClass);
      expect(plan).toMatchObject({ weeklyPriceAud: packageItem.weeklyPrice, appointmentIntervalWeeks: packageItem.appointmentIntervalWeeks, billingCycleWeeks: 1, weightBand: band?.label });
    }
  });
});
