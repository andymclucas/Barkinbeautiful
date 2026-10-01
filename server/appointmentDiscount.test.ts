import { describe, it, expect } from "vitest";
import {
  applyDiscount, validateDiscount, isValidDiscountPercent, describeDiscount,
  toCents, fromCents, DISCOUNT_PERCENTS,
} from "@shared/appointmentDiscount";

describe("isValidDiscountPercent", () => {
  it("accepts only the four the salon offers", () => {
    for (const p of DISCOUNT_PERCENTS) expect(isValidDiscountPercent(p)).toBe(true);
    for (const p of [0, 1, 25, 50, 100, -10, 7.5]) expect(isValidDiscountPercent(p)).toBe(false);
    expect(isValidDiscountPercent("10")).toBe(false);
    expect(isValidDiscountPercent(null)).toBe(false);
  });
});

describe("applyDiscount", () => {
  it("takes the right amount off a round price", () => {
    const r = applyDiscount("100.00", 10);
    expect(r.grossCents).toBe(10000);
    expect(r.discountCents).toBe(1000);
    expect(r.netCents).toBe(9000);
  });

  it("rounds a half-cent discount rather than leaving floating point dust", () => {
    // 15% of $47.50 is $7.125 exactly.
    const r = applyDiscount("47.50", 15);
    expect(r.discountCents).toBe(713);
    expect(r.netCents).toBe(4037);
    // The books must reconcile: gross - discount === net, always.
    expect(r.grossCents - r.discountCents).toBe(r.netCents);
  });

  it("always reconciles across every price and percent", () => {
    for (const price of ["17.00", "22.50", "34.00", "40.00", "51.00", "104.00", "0.05", "999.99"]) {
      for (const pct of DISCOUNT_PERCENTS) {
        const r = applyDiscount(price, pct);
        expect(r.grossCents - r.discountCents).toBe(r.netCents);
        expect(r.netCents).toBeGreaterThanOrEqual(0);
        expect(r.netCents).toBeLessThanOrEqual(r.grossCents);
      }
    }
  });

  it("is a no-op with no percent", () => {
    const r = applyDiscount("51.00", null);
    expect(r.discountCents).toBe(0);
    expect(r.netCents).toBe(5100);
    expect(r.percent).toBeNull();
  });

  it("refuses an invalid percent rather than applying it", () => {
    expect(applyDiscount("100.00", 50 as never).discountCents).toBe(0);
  });

  it("copes with a missing or junk price", () => {
    expect(applyDiscount(null, 10).netCents).toBe(0);
    expect(applyDiscount("", 10).netCents).toBe(0);
    expect(applyDiscount("not money", 10).netCents).toBe(0);
    expect(applyDiscount("-20.00", 10).grossCents).toBe(0);
  });
});

describe("validateDiscount", () => {
  it("requires a reason — the whole point of the feature", () => {
    const r = validateDiscount({ percent: 10, reason: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/why/i);
  });

  it("accepts a percent with a reason, trimmed", () => {
    const r = validateDiscount({ percent: 15, reason: "  Staff family rate " });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.percent).toBe(15); expect(r.reason).toBe("Staff family rate"); }
  });

  it("clears the reason when the discount is removed", () => {
    const r = validateDiscount({ percent: null, reason: "no longer applies" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.percent).toBeNull(); expect(r.reason).toBeNull(); }
  });

  it("rejects a percent the salon does not offer", () => {
    expect(validateDiscount({ percent: 25, reason: "because" }).ok).toBe(false);
  });

  it("rejects an essay", () => {
    expect(validateDiscount({ percent: 5, reason: "x".repeat(201) }).ok).toBe(false);
  });
});

describe("money helpers", () => {
  it("round-trips through cents", () => {
    expect(fromCents(toCents("47.50"))).toBe("47.50");
    expect(fromCents(toCents("0.05"))).toBe("0.05");
  });
});

describe("describeDiscount", () => {
  it("reads as a sentence a staff member would say", () => {
    expect(describeDiscount(15, "Long-standing client", 713))
      .toBe("15% off — Long-standing client ($7.13)");
    expect(describeDiscount(10, null)).toBe("10% off");
    expect(describeDiscount(null, "x")).toBeNull();
  });
});
