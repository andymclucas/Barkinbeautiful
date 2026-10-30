import { describe, it, expect } from "vitest";
import { gstFromInclusive, exGst, gstBreakdown, GST_RATE } from "@shared/gst";

describe("gstFromInclusive", () => {
  it("backs GST out of a tax-inclusive price", () => {
    // $110 inclusive is $100 + $10, not $110 + $11.
    expect(gstFromInclusive(110)).toBe(10);
    expect(gstFromInclusive(55)).toBe(5);
  });

  it("rounds to the cent", () => {
    expect(gstFromInclusive(120)).toBe(10.91);
    expect(gstFromInclusive(95)).toBe(8.64);
    expect(gstFromInclusive(0.1)).toBe(0.01);
  });

  it("is zero for a membership groom, which carries no price", () => {
    expect(gstFromInclusive(0)).toBe(0);
  });

  it("is zero rather than negative for nonsense", () => {
    expect(gstFromInclusive(-50)).toBe(0);
    expect(gstFromInclusive(NaN)).toBe(0);
    expect(gstFromInclusive(Infinity)).toBe(0);
  });

  it("is the rate it says it is", () => {
    expect(GST_RATE).toBe(0.1);
  });
});

describe("exGst", () => {
  it("is the amount without the tax", () => {
    expect(exGst(110)).toBe(100);
    expect(exGst(120)).toBe(109.09);
  });
});

describe("gstBreakdown", () => {
  /**
   * The whole reason ex-GST is a subtraction rather than its own
   * division. A client checking the invoice on their phone must get
   * the total back; two independent roundings do not guarantee it.
   */
  it("always adds up, to the cent", () => {
    for (let cents = 0; cents <= 50_000; cents += 7) {
      const total = cents / 100;
      const b = gstBreakdown(total);
      expect(
        Math.round(b.exGst * 100) + Math.round(b.gst * 100),
        `${total} broke down to ${b.exGst} + ${b.gst}`,
      ).toBe(Math.round(total * 100));
    }
  });

  it("reports the real salon numbers", () => {
    // A Classic Regular Giant is $325 in the catalogue.
    expect(gstBreakdown(325)).toEqual({ total: 325, gst: 29.55, exGst: 295.45 });
  });

  it("handles a two-dog bill", () => {
    expect(gstBreakdown(186.5)).toEqual({ total: 186.5, gst: 16.95, exGst: 169.55 });
  });
});
