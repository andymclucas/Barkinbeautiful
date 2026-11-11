import { describe, expect, it } from "vitest";
import { cleanPlanFields, normalisePlanService, normalisePlanTier, normalisePlanWeightBand } from "./membershipPlanFields";

describe("reading a plan's fields the way they were typed", () => {
  it("reads Lauren's plan, as saved on 12/11/2026", () => {
    expect(normalisePlanTier("Gold +")).toBe("gold");
    expect(normalisePlanService("Classic")).toBe("classic");
    expect(normalisePlanWeightBand("small 0-10kg")).toEqual({ band: "small", recognised: true });
  });

  it("knows every band by id, label, kilos or MoeGo shorthand", () => {
    const band = (v: string) => normalisePlanWeightBand(v).band;
    expect(band("small_medium")).toBe("small_medium");
    expect(band("Small-Medium (11–13 kg)")).toBe("small_medium"); // numbers beat words
    expect(band("SML-10kg")).toBe("small");
    expect(band("MED14-17KG")).toBe("medium");                    // word fallback
    expect(band("Large 17–25kg")).toBe("large");
    expect(band("Extra Large")).toBe("extra_large");
    expect(band("XL")).toBe("extra_large");
    expect(band("Giant (36–80 kg)")).toBe("giant");
  });

  it("treats a blank band as any weight, and says when it cannot read one", () => {
    expect(normalisePlanWeightBand("")).toEqual({ band: null, recognised: true });
    expect(normalisePlanWeightBand(null)).toEqual({ band: null, recognised: true });
    expect(normalisePlanWeightBand("fluffy ones")).toEqual({ band: null, recognised: false });
  });

  it("does not guess a tier or service that is not named", () => {
    expect(normalisePlanTier("VIP")).toBeNull();
    expect(normalisePlanService("classic or styled")).toBeNull();
    expect(normalisePlanService("Styled")).toBe("styled");
  });
});

describe("cleanPlanFields — what saving a plan stores", () => {
  it("stores the clean values", () => {
    expect(cleanPlanFields({ tier: "Gold +", serviceVariant: "Classic", weightBand: "small 0-10kg" }))
      .toEqual({ ok: true, tier: "gold", serviceVariant: "classic", weightBand: "small" });
    expect(cleanPlanFields({ tier: "silver", serviceVariant: "", weightBand: "" }))
      .toEqual({ ok: true, tier: "silver", serviceVariant: "classic", weightBand: null });
  });

  it("refuses what it cannot read, saying which field", () => {
    expect(cleanPlanFields({ tier: "Premium" })).toMatchObject({ ok: false, reason: expect.stringContaining("Tier") });
    expect(cleanPlanFields({ tier: "gold", serviceVariant: "deluxe" })).toMatchObject({ ok: false, reason: expect.stringContaining("Service") });
    expect(cleanPlanFields({ tier: "gold", weightBand: "fluffy" })).toMatchObject({ ok: false, reason: expect.stringContaining("Weight band") });
  });
});
