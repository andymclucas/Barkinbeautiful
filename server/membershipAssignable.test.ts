import { describe, expect, it } from "vitest";
import {
  customPlanId, visitsPerYearFor, fromPlan, fromBuiltIn, assignablePackagesFor,
  validatePlanForAssignment,
} from "@shared/membershipAssignable";
import { MEMBERSHIP_PACKAGES, getMembershipPackagesForWeight } from "@shared/membershipPackages";

// Lauren's actual case: a long-standing client wants a five-weekly styled
// clip for two cavoodles, called "Silver +".
const silverPlus = {
  id: 12, name: "Silver +", tier: "silver-plus", serviceVariant: "styled",
  weightBand: null, weeklyPriceAud: "48.00", appointmentIntervalWeeks: 5, isActive: true,
};

describe("a membership the salon wrote itself", () => {
  it("expresses a name and interval the built-ins cannot", () => {
    // "Silver +" is not one of the five tiers, and five weeks is not one
    // of the built-in schedules. Both were impossible before.
    const pkg = fromPlan(silverPlus);
    expect(pkg.name).toBe("Silver +");
    expect(pkg.appointmentIntervalWeeks).toBe(5);
    expect(pkg.custom).toBe(true);
    expect(MEMBERSHIP_PACKAGES.some(p => p.appointmentIntervalWeeks === 5)).toBe(false);
  });

  it("carries its own price through as a number", () => {
    expect(fromPlan(silverPlus).weeklyPrice).toBe(48);
    expect(fromPlan({ ...silverPlus, weeklyPriceAud: 52.5 }).weeklyPrice).toBe(52.5);
  });

  it("defaults to a classic clip when no variant is set", () => {
    expect(fromPlan({ ...silverPlus, serviceVariant: null }).serviceType).toBe("classic");
    expect(fromPlan({ ...silverPlus, serviceVariant: "   " }).serviceType).toBe("classic");
  });

  it("works out visits a year from the interval", () => {
    // A five-weekly membership delivers ten grooms, not 10.4. Quoting a
    // fraction of a groom to a client reads as a mistake.
    expect(visitsPerYearFor(5)).toBe("10 grooms a year");
    expect(visitsPerYearFor(2)).toBe("26 grooms a year");
    expect(visitsPerYearFor(0)).toBe("—");
    expect(visitsPerYearFor(-1)).toBe("—");
  });
});

describe("telling a custom plan from a built-in", () => {
  it("round-trips the row id", () => {
    expect(customPlanId(fromPlan(silverPlus).id)).toBe(12);
  });

  it("returns null for a built-in id", () => {
    expect(customPlanId("silver-styled-small")).toBeNull();
    expect(customPlanId("plan:")).toBeNull();
    expect(customPlanId("plan:0")).toBeNull();
    expect(customPlanId("plan:abc")).toBeNull();
  });
});

describe("what gets offered for a particular dog", () => {
  const smallBuiltIns = getMembershipPackagesForWeight(8); // a cavoodle

  it("offers a bespoke plan whatever the dog weighs", () => {
    // A plan with no weight band was written for particular dogs. Hiding
    // it because it does not name a band would hide the only one that fits.
    const offered = assignablePackagesFor(smallBuiltIns, [silverPlus], "small");
    expect(offered[0].name).toBe("Silver +");
    const forGiant = assignablePackagesFor([], [silverPlus], "giant");
    expect(forGiant.map(p => p.name)).toContain("Silver +");
  });

  it("respects a weight band when the plan names one", () => {
    const banded = { ...silverPlus, weightBand: "small" };
    expect(assignablePackagesFor([], [banded], "small")).toHaveLength(1);
    expect(assignablePackagesFor([], [banded], "giant")).toHaveLength(0);
  });

  it("leaves out a retired plan", () => {
    expect(assignablePackagesFor([], [{ ...silverPlus, isActive: false }], "small")).toHaveLength(0);
  });

  it("puts the salon's own plans first", () => {
    const offered = assignablePackagesFor(smallBuiltIns, [silverPlus], "small");
    expect(offered[0].custom).toBe(true);
    expect(offered.slice(1).every(p => !p.custom)).toBe(true);
    // And the built-ins are all still there.
    expect(offered).toHaveLength(smallBuiltIns.length + 1);
  });

  it("still returns the built-ins when the salon has written none", () => {
    const offered = assignablePackagesFor(smallBuiltIns, [], "small");
    expect(offered).toHaveLength(smallBuiltIns.length);
    expect(offered.every(p => !p.custom)).toBe(true);
    expect(offered[0]).toEqual(fromBuiltIn(smallBuiltIns[0]));
  });
});

describe("a custom plan still has to fit the database", () => {
  it("accepts a plan whose tier is one of the five", () => {
    // Lauren's case stores as tier "silver", name "Silver +". The client
    // sees the name; the tier is the billing class behind it.
    expect(validatePlanForAssignment({ name: "Silver +", tier: "silver", serviceType: "styled" }))
      .toEqual({ ok: true });
  });

  it("explains what to change when the tier is not storable", () => {
    // memberships.tier is a MySQL enum. Without this the insert fails on
    // a column constraint nobody reading the screen could act on.
    const result = validatePlanForAssignment({ name: "Silver +", tier: "silver-plus", serviceType: "styled" });
    expect(result.ok).toBe(false);
    const reason = (result as { reason: string }).reason;
    expect(reason).toContain("Silver +");
    expect(reason).toContain("silver-plus");
    expect(reason).toMatch(/NAME is what the client sees/);
  });

  it("refuses a service type the column cannot hold", () => {
    const result = validatePlanForAssignment({ name: "Odd", tier: "silver", serviceType: "hand-strip" });
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/classic or styled/);
  });
});

describe("not offering the same membership twice", () => {
  // The 48 seeded membership_plans rows mirror the built-in packages one
  // for one. The first run against real data offered a 42kg dog seventeen
  // packages, nine of them duplicates of the eight built-ins.
  const smallBuiltIns = getMembershipPackagesForWeight(8);
  const mirrorOfABuiltIn = {
    id: 99, name: "Diamond VIP - Small (0-10kg)", tier: "diamond",
    serviceVariant: "classic", weightBand: "small",
    weeklyPriceAud: "52.00", appointmentIntervalWeeks: 2, isActive: true,
  };

  it("leaves out a plan that mirrors a built-in", () => {
    const offered = assignablePackagesFor(smallBuiltIns, [mirrorOfABuiltIn], "small");
    expect(offered).toHaveLength(smallBuiltIns.length);
    expect(offered.filter(p => p.custom)).toHaveLength(0);
  });

  it("matches on tier, service and band rather than name", () => {
    // Renaming a seeded plan has not created a different membership.
    const renamed = { ...mirrorOfABuiltIn, name: "Our Diamond Deal" };
    expect(assignablePackagesFor(smallBuiltIns, [renamed], "small").filter(p => p.custom)).toHaveLength(0);
  });

  it("still offers one that is genuinely different", () => {
    // Silver + is five-weekly with no band — nothing built in matches it.
    const offered = assignablePackagesFor(smallBuiltIns, [silverPlus, mirrorOfABuiltIn], "small");
    expect(offered.filter(p => p.custom).map(p => p.name)).toEqual(["Silver +"]);
  });
});
