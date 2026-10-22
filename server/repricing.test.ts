import { describe, it, expect } from "vitest";
import { catalogueePriceFor, repriceForService } from "../shared/repricing";
import type { PriceCatalogueItem } from "../shared/groomPricing";

function row(p: Partial<PriceCatalogueItem> & { id: number; name: string }): PriceCatalogueItem {
  return { legacyServiceType: "classic_groom", weightBand: null, priceMode: "fixed", priceAud: null, sortOrder: 0, ...p };
}

/** The salon's real rows for a medium dog, 14-16kg. */
const CATALOGUE = [
  row({ id: 1, name: "Full Groom (Classic) - New Client - Medium", legacyServiceType: "classic_groom", weightBand: "14-16kg", priceAud: "200.00" }),
  row({ id: 2, name: "Full Groom (Classic) - VIP Client - Medium", legacyServiceType: "classic_groom", weightBand: "14-16kg", priceAud: "176.00" }),
  row({ id: 3, name: "Tidy - Medium, long hair", legacyServiceType: "fft", weightBand: "14-16kg", priceAud: "110.00" }),
];

describe("catalogueePriceFor", () => {
  it("finds the price for the service and tier", () => {
    expect(catalogueePriceFor({ serviceType: "fft", sizeBand: "medium", tier: "new", catalogue: CATALOGUE })).toBe("110.00");
    expect(catalogueePriceFor({ serviceType: "classic_groom", sizeBand: "medium", tier: "vip", catalogue: CATALOGUE })).toBe("176.00");
  });

  it("answers null when the dog has no size band", () => {
    // 10,372 of 12,552 dogs have no recorded weight, so this is the
    // common case, not an edge one.
    expect(catalogueePriceFor({ serviceType: "fft", sizeBand: null, tier: "new", catalogue: CATALOGUE })).toBeNull();
  });

  it("answers null when the catalogue has no row for that combination", () => {
    expect(catalogueePriceFor({ serviceType: "deshed", sizeBand: "medium", tier: "new", catalogue: CATALOGUE })).toBeNull();
  });
});

describe("repriceForService", () => {
  it("moves a groom price to the tidy price — Lauren's actual case", () => {
    // Miller changed from a classic groom to a tidy and kept the $200.
    const out = repriceForService({
      serviceType: "fft", sizeBand: "medium", tier: "new",
      catalogue: CATALOGUE, currentPrice: "200.00",
    });
    expect(out).toEqual({ repriced: true, price: "110.00", from: "200.00" });
  });

  it("leaves the box alone when the catalogue cannot answer", () => {
    // Clearing a real figure because the catalogue has a gap turns a
    // wrong price into no price, which invoices as zero.
    const out = repriceForService({
      serviceType: "deshed", sizeBand: "medium", tier: "new",
      catalogue: CATALOGUE, currentPrice: "200.00",
    });
    expect(out).toEqual({ repriced: false, reason: "no-catalogue-price" });
  });

  it("stays quiet when the price is already what the catalogue says", () => {
    const out = repriceForService({
      serviceType: "fft", sizeBand: "medium", tier: "new",
      catalogue: CATALOGUE, currentPrice: "110.00",
    });
    expect(out).toEqual({ repriced: false, reason: "already-correct" });
  });

  it("treats 110 and 110.00 as the same figure", () => {
    // The box holds what somebody typed; the catalogue holds a decimal.
    const out = repriceForService({
      serviceType: "fft", sizeBand: "medium", tier: "new",
      catalogue: CATALOGUE, currentPrice: "110",
    });
    expect(out.repriced).toBe(false);
  });

  it("fills an empty box rather than treating it as deliberate", () => {
    const out = repriceForService({
      serviceType: "fft", sizeBand: "medium", tier: "new",
      catalogue: CATALOGUE, currentPrice: "",
    });
    expect(out).toEqual({ repriced: true, price: "110.00", from: null });
  });

  it("prices a member at their own rate, not the casual one", () => {
    const out = repriceForService({
      serviceType: "classic_groom", sizeBand: "medium", tier: "vip",
      catalogue: CATALOGUE, currentPrice: "200.00",
    });
    expect(out).toEqual({ repriced: true, price: "176.00", from: "200.00" });
  });

  it("does nothing for a dog with no size on file", () => {
    const out = repriceForService({
      serviceType: "fft", sizeBand: null, tier: "new",
      catalogue: CATALOGUE, currentPrice: "200.00",
    });
    expect(out).toEqual({ repriced: false, reason: "no-catalogue-price" });
  });
});
