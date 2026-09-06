import { describe, expect, it } from "vitest";
import {
  getDepartedMembershipBillingImpact,
  isEligibleMembershipReplacement,
  replacementEligibilityMessage,
} from "../shared/departedPetMembership";

describe("departed-pet membership replacement eligibility", () => {
  it("allows a replacement that remains within the same configured weight band", () => {
    expect(isEligibleMembershipReplacement(
      { id: 1, weightKg: "11.0", status: "departed" },
      { id: 2, weightKg: "13.0", status: "active" },
    )).toBe(true);
  });

  it("rejects a replacement across adjacent size bands", () => {
    expect(isEligibleMembershipReplacement(
      { id: 1, weightKg: "10.0", status: "departed" },
      { id: 2, weightKg: "11.0", status: "active" },
    )).toBe(false);
    expect(replacementEligibilityMessage(
      { id: 1, weightKg: "10.0", status: "departed" },
      { id: 2, weightKg: "11.0", status: "active" },
    )).toContain("Small");
  });

  it("rejects departed, identical, or unweighed replacement pets", () => {
    const source = { id: 1, weightKg: "17.0", status: "departed" as const };
    expect(isEligibleMembershipReplacement(source, { id: 1, weightKg: "17.0", status: "active" })).toBe(false);
    expect(isEligibleMembershipReplacement(source, { id: 2, weightKg: "17.0", status: "departed" })).toBe(false);
    expect(isEligibleMembershipReplacement(source, { id: 2, weightKg: null, status: "active" })).toBe(false);
  });

  it("states the irreversible future-billing effect before a removal and preserves billing on transfer", () => {
    expect(getDepartedMembershipBillingImpact("remove", "25.00", new Date("2026-09-01T00:00:00Z")))
      .toContain("stops immediately");
    expect(getDepartedMembershipBillingImpact("transfer", "25", new Date("2026-09-01T00:00:00Z")))
      .toContain("continues at $25.00/wk");
  });
});
