import { describe, expect, it } from "vitest";
import {
  getDepartedMembershipBillingImpact,
  getReplacementWeightBand,
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

  /**
   * The case the test above LOOKED like it covered and did not.
   *
   * It only ever put a null weight against a 17 kg dog, so the rejection
   * came from the band mismatch — Large against the Small that
   * `getPetWeightBand(null)` wrongly answers — and never from the
   * missing weight. Make both dogs unweighed and the mismatch
   * disappears, both read Small, and the transfer was allowed.
   */
  it("does not treat two unweighed dogs as a matching pair", () => {
    const unweighed = { id: 1, weightKg: null, weight: null, status: "departed" as const };
    expect(isEligibleMembershipReplacement(unweighed, { id: 2, weightKg: null, weight: null, status: "active" })).toBe(false);
    expect(isEligibleMembershipReplacement(unweighed, { id: 2, status: "active" })).toBe(false);
    expect(isEligibleMembershipReplacement(unweighed, { id: 2, weightKg: "", weight: "", status: "active" })).toBe(false);
    expect(replacementEligibilityMessage(unweighed, { id: 2, weightKg: null, status: "active" }))
      .toContain("need a recorded weight");
  });

  it("reads a dog with no weight as nothing, not as Small", () => {
    // The whole bug in one assertion: Number(null) is 0 and the Small
    // band starts at 0, so the plain weight helper says Small here.
    expect(getReplacementWeightBand({ id: 1, weightKg: null })).toBeNull();
    expect(getReplacementWeightBand({ id: 1 })).toBeNull();
    expect(getReplacementWeightBand({ id: 1, weightKg: "  " })).toBeNull();
  });

  /**
   * 4,478 active dogs have a band and no weight. Refusing all of them
   * would be correct and useless, so the recorded band stands in —
   * the same fallback, for the same dogs, as getAutoDurationMinutes.
   */
  it("falls back to the recorded size band when nothing has been weighed", () => {
    expect(getReplacementWeightBand({ id: 1, weightKg: null, sizeBand: "large" })?.id).toBe("large");
    expect(isEligibleMembershipReplacement(
      { id: 1, weightKg: null, sizeBand: "large", status: "departed" },
      { id: 2, weightKg: null, sizeBand: "large", status: "active" },
    )).toBe(true);
    expect(isEligibleMembershipReplacement(
      { id: 1, weightKg: null, sizeBand: "large", status: "departed" },
      { id: 2, weightKg: null, sizeBand: "small", status: "active" },
    )).toBe(false);
  });

  it("prefers the scales over a band somebody set by hand", () => {
    // A band set years ago must not override a figure from the scales,
    // on either side of the comparison.
    expect(getReplacementWeightBand({ id: 1, weightKg: "20.0", sizeBand: "small" })?.id).toBe("large");
    expect(isEligibleMembershipReplacement(
      { id: 1, weightKg: "20.0", sizeBand: "small", status: "departed" },
      { id: 2, weightKg: null, sizeBand: "small", status: "active" },
    )).toBe(false);
  });

  it("takes the second weight column when the first is blank", () => {
    expect(getReplacementWeightBand({ id: 1, weightKg: null, weight: "12.0" })?.id).toBe("small_medium");
    expect(getReplacementWeightBand({ id: 1, weightKg: "", weight: "12.0" })?.id).toBe("small_medium");
  });

  it("states the irreversible future-billing effect before a removal and preserves billing on transfer", () => {
    expect(getDepartedMembershipBillingImpact("remove", "25.00", new Date("2026-09-01T00:00:00Z")))
      .toContain("stops immediately");
    expect(getDepartedMembershipBillingImpact("transfer", "25", new Date("2026-09-01T00:00:00Z")))
      .toContain("continues at $25.00/wk");
  });
});
