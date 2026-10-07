import { describe, expect, it } from "vitest";
import { petWeightUpdate } from "@shared/petWeight";

/**
 * This replaces a source-grep assertion in petWeightMembershipAccess.test.ts
 * that pinned the literal text `set({ weightKg: recordedWeight, weight:
 * recordedWeight })`. It broke the moment that call gained a line, while the
 * app worked perfectly — the exact failure CLAUDE.md warns about. The rule it
 * was guarding is real, so it is asserted here as behaviour instead.
 */
describe("what recording a weight writes", () => {
  it("writes BOTH weight columns, always together", () => {
    // They are near-duplicates and different screens read different ones.
    // Writing one leaves a dog that is 22 kg here and unweighed there.
    const update = petWeightUpdate(22);
    expect(update.weightKg).toBe("22.0");
    expect(update.weight).toBe("22.0");
  });

  it("records one decimal place, as the column holds", () => {
    expect(petWeightUpdate(7).weightKg).toBe("7.0");
    expect(petWeightUpdate(7.25).weightKg).toBe("7.3");
  });

  it("sets the size band from the weight, marked as weighed", () => {
    const update = petWeightUpdate(22);
    expect(update.sizeBand).toBe("large");
    expect(update.sizeBandSource).toBe("weighed");
  });

  it("lets an intentional unknown weight through", () => {
    // "Leave blank if unknown" is a real choice on the pet record.
    const update = petWeightUpdate(null);
    expect(update.weightKg).toBeNull();
    expect(update.weight).toBeNull();
  });

  it("does not wipe the band when the weight is cleared", () => {
    // Forgetting the number does not make the dog a different size, and
    // clearing it would throw away the MoeGo import's work on a mis-tap.
    const update = petWeightUpdate(null);
    expect(update.sizeBand).toBeUndefined();
    expect(update.sizeBandSource).toBeUndefined();
    expect(Object.keys(update)).toEqual(["weightKg", "weight"]);
  });

  it("treats zero as no weight rather than a band", () => {
    expect(petWeightUpdate(0).weightKg).toBe("0.0");
    expect(petWeightUpdate(0).sizeBand).toBeUndefined();
  });
});
