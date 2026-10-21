import { describe, it, expect } from "vitest";
import {
  estimateOnlineBookingPrice, describeBookedWeight,
  ESTIMATE_DISCLAIMER, ESTIMATE_DISCLAIMER_SHORT,
} from "../shared/onlineBookingPrice";
import type { PriceCatalogueItem } from "../shared/groomPricing";

function row(p: Partial<PriceCatalogueItem> & { id: number; name: string }): PriceCatalogueItem {
  return {
    legacyServiceType: "classic_groom", weightBand: null,
    priceMode: "fixed", priceAud: null, sortOrder: 0, ...p,
  };
}

/** The live catalogue's shape for the two services this mostly serves. */
const TIERED = [
  row({ id: 1, name: "Full Groom (Classic) - VIP Client - Small", weightBand: "0-10kg", priceAud: "110.00" }),
  row({ id: 2, name: "Full Groom (Classic) - Regular Client - Small", weightBand: "0-10kg", priceAud: "125.00" }),
  row({ id: 3, name: "Full Groom (Classic) - New Client - Small", weightBand: "0-10kg", priceAud: "145.00" }),
];

describe("a stranger is priced as a new client", () => {
  it("picks the New Client row, not the VIP one", () => {
    // The dearest of the three. Quoting a member's rate to a stranger and
    // correcting it on the day is the error that feels like a bait and switch.
    const out = estimateOnlineBookingPrice({ serviceType: "classic_groom", weightKg: 8, catalogue: TIERED });
    expect(out).toMatchObject({ known: true, price: "145.00" });
  });

  it("always carries the disclaimer with the figure", () => {
    const out = estimateOnlineBookingPrice({ serviceType: "classic_groom", weightKg: 8, catalogue: TIERED });
    expect(out.known && out.disclaimer).toBe(ESTIMATE_DISCLAIMER);
  });
});

describe("it refuses to guess when the catalogue cannot decide", () => {
  /**
   * The live de-shed rows on 21/10/2026: three prices, no weight bands,
   * told apart only by duration in the name. Picking the first quoted
   * $120 for a dog whose real price is $330.
   */
  const DESHED = [
    row({ id: 10, name: "De-shed - 1 hour, small dog or shorter double coat", legacyServiceType: "deshed", priceAud: "120.00" }),
    row({ id: 11, name: "De-shed - 2 hour, longer hair breed", legacyServiceType: "deshed", priceAud: "220.00" }),
    row({ id: 12, name: "De-shed - 3 hour, large long-haired breed", legacyServiceType: "deshed", priceAud: "330.00" }),
  ];

  it("does not quote $120 for a 45kg de-shed", () => {
    const out = estimateOnlineBookingPrice({ serviceType: "deshed", weightKg: 45, catalogue: DESHED });
    expect(out.known).toBe(false);
    // The specific regression: the cheapest of three must never be "the price".
    expect(out).not.toMatchObject({ price: "120.00" });
  });

  it("hands back the full span instead, lowest to highest", () => {
    const out = estimateOnlineBookingPrice({ serviceType: "deshed", weightKg: 45, catalogue: DESHED });
    expect(out.known === false && out.range).toEqual({ low: "120.00", high: "330.00" });
  });

  it("explains why rather than implying the salon does not know its own prices", () => {
    const out = estimateOnlineBookingPrice({ serviceType: "deshed", weightKg: 45, catalogue: DESHED });
    expect(out.known === false && out.reason).toContain("priced on the day");
  });

  it("refuses the same way for two overlapping products at one weight", () => {
    // bath_only carries both a blow-dry and a towel-dry row.
    const BATH = [
      row({ id: 20, name: "Bath & Blow-dry - Small", legacyServiceType: "bath_only", weightBand: "0-10kg", priceAud: "60.00" }),
      row({ id: 21, name: "Quick Clean (Towel Dry) - Small to Medium", legacyServiceType: "bath_only", weightBand: "0-16kg", priceAud: "50.00" }),
    ];
    const out = estimateOnlineBookingPrice({ serviceType: "bath_only", weightKg: 5, catalogue: BATH });
    expect(out.known).toBe(false);
    expect(out.known === false && out.range).toEqual({ low: "50.00", high: "60.00" });
  });

  it("still quotes a single unambiguous row, banded or not", () => {
    // One row, no band, flat price — a nail clip really is $25 for every dog.
    const NAILS = [row({ id: 30, name: "Nail Clipping", legacyServiceType: "nail_trim", priceAud: "25.00" })];
    expect(estimateOnlineBookingPrice({ serviceType: "nail_trim", weightKg: 45, catalogue: NAILS }))
      .toMatchObject({ known: true, price: "25.00" });
  });

  it("treats two rows at the SAME price as one answer", () => {
    // 11-13kg classic has New and Regular both at $163. That is not an
    // ambiguity — either way the client pays $163.
    const SAME = [
      row({ id: 40, name: "Full Groom (Classic) - New Client - Small-Medium", weightBand: "11-13kg", priceAud: "163.00" }),
      row({ id: 41, name: "Full Groom (Classic) - Regular Client - Small-Medium", weightBand: "11-13kg", priceAud: "163.00" }),
    ];
    expect(estimateOnlineBookingPrice({ serviceType: "classic_groom", weightKg: 12, catalogue: SAME }))
      .toMatchObject({ known: true, price: "163.00" });
  });
});

describe("it declines rather than inventing", () => {
  it("says nothing useful is known when the band has no row at all", () => {
    // 26-34kg classic carries VIP and Regular but no New Client row.
    const GAP = [
      row({ id: 50, name: "Full Groom (Classic) - VIP Client - Extra Large", weightBand: "26-34kg", priceAud: "260.00" }),
      row({ id: 51, name: "Full Groom (Classic) - Regular Client - Extra Large", weightBand: "26-34kg", priceAud: "290.00" }),
    ];
    const out = estimateOnlineBookingPrice({ serviceType: "classic_groom", weightKg: 30, catalogue: GAP });
    // Those two are a different TIER, so they are not this client's price;
    // showing their span would quote a member's rate to a stranger.
    expect(out.known).toBe(false);
  });

  it("asks for a weight rather than guessing one", () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      const out = estimateOnlineBookingPrice({ serviceType: "classic_groom", weightKg: bad, catalogue: TIERED });
      expect(out).toMatchObject({ known: false });
      expect(out.known === false && out.reason).toContain("weight");
    }
  });

  it("declines a weight outside every band", () => {
    expect(estimateOnlineBookingPrice({ serviceType: "classic_groom", weightKg: 200, catalogue: TIERED }).known).toBe(false);
  });

  it("declines an empty catalogue instead of throwing", () => {
    expect(estimateOnlineBookingPrice({ serviceType: "classic_groom", weightKg: 8, catalogue: [] }).known).toBe(false);
  });

  it("ignores a row with no price", () => {
    const QUOTE = [row({ id: 60, name: "Full Groom (Classic) - New Client - Small", weightBand: "0-10kg", priceMode: "quote", priceAud: null })];
    expect(estimateOnlineBookingPrice({ serviceType: "classic_groom", weightKg: 8, catalogue: QUOTE }).known).toBe(false);
  });
});

describe("the disclaimer text", () => {
  it("names both things that move the price, as Andy asked", () => {
    // "price is dependant on dog weight and appt duration, this is
    // subject to change" — 21/10/2026.
    expect(ESTIMATE_DISCLAIMER).toMatch(/weight/i);
    expect(ESTIMATE_DISCLAIMER).toMatch(/long|duration|time/i);
    expect(ESTIMATE_DISCLAIMER).toMatch(/change/i);
  });

  it("keeps the short form short enough for a text message", () => {
    expect(ESTIMATE_DISCLAIMER_SHORT.length).toBeLessThanOrEqual(80);
    expect(ESTIMATE_DISCLAIMER_SHORT).toMatch(/estimate/i);
  });
});

describe("describeBookedWeight", () => {
  it("says the weight was entered by the owner, not measured", () => {
    expect(describeBookedWeight(12)).toContain("as entered");
    expect(describeBookedWeight(12)).toContain("12kg");
  });

  it("still reads as a sentence for a weight outside every band", () => {
    expect(describeBookedWeight(120)).toBe("120kg, as entered");
  });
});
