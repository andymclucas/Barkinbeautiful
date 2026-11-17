import { describe, it, expect } from "vitest";
import { catalogueePriceFor, repriceForService, priceAfterServiceChange, notRepricedMessage } from "../shared/repricing";
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

describe("priceAfterServiceChange", () => {
  const base = { sizeBand: "medium" as const, tier: "vip" as const, catalogue: CATALOGUE };

  it("sets a covered member groom to zero, not the members' rate", () => {
    // Fix desk 0009: a member's dog moved onto a groom its plan covers
    // was re-priced to $176 when a covered groom carries no price.
    const out = priceAfterServiceChange({
      ...base, serviceType: "classic_groom", currentPrice: "110.00", coveredByMembership: true,
    });
    expect(out).toEqual({ kind: "covered", price: "0.00", from: "110.00" });
  });

  it("sets a covered groom to zero even with no size or list price", () => {
    const out = priceAfterServiceChange({
      serviceType: "styled_groom", sizeBand: null, tier: "vip", catalogue: CATALOGUE,
      currentPrice: "110.00", coveredByMembership: true,
    });
    expect(out).toEqual({ kind: "covered", price: "0.00", from: "110.00" });
  });

  it("stays quiet when a covered groom is already at zero", () => {
    const out = priceAfterServiceChange({
      ...base, serviceType: "classic_groom", currentPrice: "0", coveredByMembership: true,
    });
    expect(out).toEqual({ kind: "unchanged" });
  });

  it("uses the list price when the membership does not cover the service", () => {
    const out = priceAfterServiceChange({
      ...base, serviceType: "fft", currentPrice: "0.00", coveredByMembership: false,
    });
    expect(out).toEqual({ kind: "repriced", price: "110.00", from: "0.00" });
  });

  it("says a dog with no size could not be re-priced, and why", () => {
    const out = priceAfterServiceChange({
      serviceType: "fft", sizeBand: null, tier: "new", catalogue: CATALOGUE,
      currentPrice: "200.00", coveredByMembership: false,
    });
    expect(out).toEqual({ kind: "not-repriced", reason: "no-size" });
  });

  it("says a service with no list price could not be re-priced, and why", () => {
    const out = priceAfterServiceChange({
      ...base, serviceType: "deshed", currentPrice: "200.00", coveredByMembership: false,
    });
    expect(out).toEqual({ kind: "not-repriced", reason: "no-list-price" });
  });

  it("stays quiet when the figure is already the list price", () => {
    const out = priceAfterServiceChange({
      ...base, serviceType: "fft", currentPrice: "110", coveredByMembership: false,
    });
    expect(out).toEqual({ kind: "unchanged" });
  });
});

describe("notRepricedMessage", () => {
  it("tells staff the old figure is still there and to check it", () => {
    expect(notRepricedMessage({ reason: "no-size", serviceLabel: "Deshed", currentPrice: "200.00" }))
      .toBe("Price not changed (no size on file for this dog). The price is still $200.00, so check it before saving.");
  });

  it("names the dog on a family booking and the service with no list price", () => {
    expect(notRepricedMessage({ reason: "no-list-price", serviceLabel: "Deshed", petName: "Biscuit", currentPrice: "" }))
      .toBe("Biscuit: price not changed (no list price for Deshed at this dog's size). The price is still empty, so check it before saving.");
  });
});
