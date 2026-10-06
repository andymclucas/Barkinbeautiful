import { describe, expect, it } from "vitest";
import {
  PLANS, FEATURES, PLAN_FEATURES, effectivePlan, hasFeature,
  smallestPlanWith, upgradeMessage, tenantFeatures, tenantHasFeature, isBillable,
} from "@shared/planEntitlements";

describe("the three stages Groomigo is sold in", () => {
  it("stage one is the software on its own", () => {
    expect(PLAN_FEATURES.starter).toEqual(["core"]);
    expect(hasFeature("starter", "active", "messaging")).toBe(false);
    expect(hasFeature("starter", "active", "workflow")).toBe(false);
  });

  it("stage two adds messaging and memberships, but not workflow", () => {
    expect(hasFeature("professional", "active", "messaging")).toBe(true);
    expect(hasFeature("professional", "active", "memberships")).toBe(true);
    // The upsell. If this were included there would be nothing left to sell.
    expect(hasFeature("professional", "active", "workflow")).toBe(false);
  });

  it("stage three is the one with the workflow board", () => {
    for (const f of FEATURES) expect(hasFeature("enterprise", "active", f)).toBe(true);
  });

  it("a trial sees everything, including the thing they will pay for", () => {
    // A salon evaluating Groomigo must see the workflow board — it is the
    // reason to buy stage three and they will not find it elsewhere.
    expect(hasFeature("trial", "trialing", "workflow")).toBe(true);
  });
});

describe("a subscription that lapses", () => {
  it("keeps working when the card fails", () => {
    // past_due means a payment bounced. The salon is mid-service with real
    // dogs in the building; taking the board away over a declined card is
    // a disaster for them and a reputational one for us.
    expect(hasFeature("enterprise", "past_due", "workflow")).toBe(true);
    expect(hasFeature("professional", "past_due", "messaging")).toBe(true);
  });

  it("drops to core when cancelled, so they can still get their data out", () => {
    expect(effectivePlan("enterprise", "cancelled")).toEqual(["core"]);
    expect(hasFeature("enterprise", "cancelled", "workflow")).toBe(false);
    // But never locked out of their own diary and history.
    expect(hasFeature("enterprise", "cancelled", "core")).toBe(true);
  });
});

describe("failing open, never closed", () => {
  it("treats an unknown plan as entitled rather than dark", () => {
    // A typo in a column, or an enum value added later and not mapped
    // here, must never be why a salon's board goes dark on a Saturday.
    for (const f of FEATURES) {
      expect(hasFeature("something-new", "active", f), `plan unknown, ${f}`).toBe(true);
      expect(hasFeature(null, null, f), `plan null, ${f}`).toBe(true);
      expect(hasFeature(undefined, undefined, f), `plan undefined, ${f}`).toBe(true);
    }
  });

  it("treats an unknown status as active", () => {
    expect(hasFeature("enterprise", "weird-status", "workflow")).toBe(true);
  });

  it("never gates core, whatever the plan or status says", () => {
    for (const p of PLANS) {
      for (const s of ["active", "cancelled", "past_due", "nonsense"]) {
        expect(hasFeature(p, s, "core"), `${p}/${s}`).toBe(true);
      }
    }
  });
});

describe("telling a salon what they are missing", () => {
  it("points at the smallest plan that includes it", () => {
    expect(smallestPlanWith("messaging")).toBe("professional");
    expect(smallestPlanWith("memberships")).toBe("professional");
    expect(smallestPlanWith("workflow")).toBe("enterprise");
    expect(smallestPlanWith("core")).toBe("starter");
  });

  it("sells the workflow board rather than just refusing", () => {
    const message = upgradeMessage("workflow");
    expect(message).toMatch(/bathing, drying and grooming/);
    expect(message).not.toMatch(/error|denied|forbidden/i);
  });
});

describe("a salon that is never billed", () => {
  // Barkin' Beautiful. The concept is theirs and Groomigo is being built
  // for them, so they are not a customer. Expressing that as "put them on
  // the top plan" would hold only until something downgrades an unpaid
  // subscription — which is exactly what a billing system does.
  const exempt = { subscriptionPlan: "starter", subscriptionStatus: "cancelled", billingExempt: true };

  it("gets everything, whatever the plan says", () => {
    for (const f of FEATURES) expect(tenantHasFeature(exempt, f), f).toBe(true);
    expect(tenantFeatures(exempt)).toEqual(FEATURES);
  });

  it("keeps everything even when the subscription is cancelled", () => {
    // The dangerous direction: a lapsed status must not reach them.
    expect(tenantHasFeature(exempt, "workflow")).toBe(true);
  });

  it("is never charged and never chased", () => {
    // The half that bites later — a dunning job emailing every past_due
    // tenant would otherwise one day email the salon this was built for.
    expect(isBillable(exempt)).toBe(false);
    expect(isBillable({ subscriptionPlan: "enterprise", subscriptionStatus: "past_due" })).toBe(true);
  });

  it("leaves paying salons subject to their plan", () => {
    const paying = { subscriptionPlan: "professional", subscriptionStatus: "active", billingExempt: false };
    expect(tenantHasFeature(paying, "messaging")).toBe(true);
    expect(tenantHasFeature(paying, "workflow")).toBe(false);
    expect(isBillable(paying)).toBe(true);
  });

  it("treats a missing flag as billable, so nobody is exempt by accident", () => {
    expect(isBillable({ subscriptionPlan: "starter" })).toBe(true);
    expect(tenantHasFeature({ subscriptionPlan: "starter" }, "workflow")).toBe(false);
  });
});
