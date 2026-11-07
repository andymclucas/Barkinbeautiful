import { describe, it, expect } from "vitest";
import { salonPlanOffer } from "../shared/salonPlanOffer";

describe("salonPlanOffer", () => {
  /**
   * The design proposal for the signup flow named this plan "Complete,
   * with Workflow" and claimed 2,500 texts. Both came out of the code
   * rather than being invented, and this is what keeps them attached to
   * it: if PLAN_LABELS or SMS_QUOTA_BY_PLAN move, the screen's words move
   * with them instead of going stale.
   */
  it("describes the top plan in the salon's own words", () => {
    const offer = salonPlanOffer("enterprise");
    expect(offer.label).toBe("Complete, with Workflow");
    expect(offer.smsIncluded).toBe(2500);
    expect(offer.smsLabel).toBe("2,500 client texts a month included");
  });

  it("lists exactly what the plan entitles them to, not a sales list", () => {
    // Straight from PLAN_FEATURES, so the screen cannot promise a
    // feature that tenantHasFeature would then refuse.
    expect(salonPlanOffer("enterprise").includes).toEqual([
      "Booking, staff and reporting",
      "Client messaging",
      "Memberships and subscriptions",
      "Workflow board and pet tracker",
    ]);
    expect(salonPlanOffer("professional").includes).toEqual([
      "Booking, staff and reporting",
      "Client messaging",
      "Memberships and subscriptions",
    ]);
    expect(salonPlanOffer("starter").includes).toEqual(["Booking, staff and reporting"]);
  });

  /**
   * Starter really includes no texts. "0 client texts included" in a
   * feature list reads as a bug, so it says what is true a different
   * way — the allowance is zero, the capability is not absent.
   */
  it("says something sensible when no texts are included", () => {
    const starter = salonPlanOffer("starter");
    expect(starter.smsIncluded).toBe(0);
    expect(starter.smsLabel).toBe("Client texts charged separately");
    expect(starter.smsLabel).not.toContain("0");
  });

  it("carries no price, because Stripe holds it", () => {
    // A figure here would be a second source of truth for money, free to
    // drift from what the card is actually charged.
    expect(Object.keys(salonPlanOffer("professional")).sort())
      .toEqual(["includes", "label", "plan", "smsIncluded", "smsLabel"]);
  });

  it("thousands-separates a real allowance, so 2500 is not read as 250", () => {
    expect(salonPlanOffer("professional").smsLabel).toBe("1,000 client texts a month included");
  });
});
