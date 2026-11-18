import { describe, it, expect } from "vitest";
import {
  catalogueePriceFor,
  repriceForService,
  priceAfterServiceChange,
  notRepricedMessage,
  bookablePetIdsForCoverage,
  coverageForServiceChange,
} from "../shared/repricing";
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
  const base = { pricingLoaded: true, sizeBand: "medium" as const, tier: "vip" as const, catalogue: CATALOGUE };

  it("sets a covered member groom to zero, not the members' rate", () => {
    // Fix desk 0009: a member's dog moved onto a groom its plan covers
    // was re-priced to $176 when a covered groom carries no price.
    const out = priceAfterServiceChange({
      ...base, serviceType: "classic_groom", currentPrice: "110.00", coverage: "covered",
    });
    expect(out).toEqual({ kind: "covered", price: "0.00", from: "110.00" });
  });

  it("sets a covered groom to zero even with no size or list price", () => {
    const out = priceAfterServiceChange({
      serviceType: "styled_groom", pricingLoaded: true, sizeBand: null, tier: "vip", catalogue: CATALOGUE,
      currentPrice: "110.00", coverage: "covered",
    });
    expect(out).toEqual({ kind: "covered", price: "0.00", from: "110.00" });
  });

  it("stays quiet when a covered groom is already at zero", () => {
    const out = priceAfterServiceChange({
      ...base, serviceType: "classic_groom", currentPrice: "0", coverage: "covered",
    });
    expect(out).toEqual({ kind: "unchanged" });
  });

  it("uses the list price when the membership does not cover the service", () => {
    const out = priceAfterServiceChange({
      ...base, serviceType: "fft", currentPrice: "0.00", coverage: "not-covered",
    });
    expect(out).toEqual({ kind: "repriced", price: "110.00", from: "0.00" });
  });

  it("says a dog with no size could not be re-priced, and why", () => {
    const out = priceAfterServiceChange({
      serviceType: "fft", pricingLoaded: true, sizeBand: null, tier: "new", catalogue: CATALOGUE,
      currentPrice: "200.00", coverage: "not-covered",
    });
    expect(out).toEqual({ kind: "not-repriced", reason: "no-size" });
  });

  it("says a service with no list price could not be re-priced, and why", () => {
    const out = priceAfterServiceChange({
      ...base, serviceType: "deshed", currentPrice: "200.00", coverage: "not-covered",
    });
    expect(out).toEqual({ kind: "not-repriced", reason: "no-list-price" });
  });

  it("stays quiet when the figure is already the list price", () => {
    const out = priceAfterServiceChange({
      ...base, serviceType: "fft", currentPrice: "110", coverage: "not-covered",
    });
    expect(out).toEqual({ kind: "unchanged" });
  });

  it("does not price a groom while the membership answer is still out", () => {
    // Release Manager, 17/11: pricing it at the list rate here is the
    // original bug, a covered member groom charged $176, said in green.
    const out = priceAfterServiceChange({
      ...base, serviceType: "classic_groom", currentPrice: "110.00", coverage: "unknown",
    });
    expect(out).toEqual({ kind: "not-repriced", reason: "coverage-unknown" });
  });

  it("says so when the dog's size or the price list has not loaded", () => {
    const out = priceAfterServiceChange({
      ...base, pricingLoaded: false, serviceType: "fft", currentPrice: "200.00", coverage: "not-covered",
    });
    expect(out).toEqual({ kind: "not-repriced", reason: "no-pricing-data" });
  });

  it("treats an empty price list as not loaded", () => {
    const out = priceAfterServiceChange({
      ...base, catalogue: [], serviceType: "fft", currentPrice: "200.00", coverage: "not-covered",
    });
    expect(out).toEqual({ kind: "not-repriced", reason: "no-pricing-data" });
  });

  it("still sets a covered groom to zero before the price list loads", () => {
    const out = priceAfterServiceChange({
      ...base, pricingLoaded: false, serviceType: "classic_groom", currentPrice: "110.00", coverage: "covered",
    });
    expect(out).toEqual({ kind: "covered", price: "0.00", from: "110.00" });
  });
});

describe("bookablePetIdsForCoverage", () => {
  it("is null until the client's dogs have loaded", () => {
    expect(bookablePetIdsForCoverage([1, 2], undefined)).toBeNull();
  });

  it("leaves out a dog that has passed away, so the coverage check is not refused", () => {
    const pets = [{ id: 1, status: "active" }, { id: 2, status: "departed" }];
    expect(bookablePetIdsForCoverage([1, 2], pets)).toEqual([1]);
  });

  it("leaves out an archived dog, which the dog list omits altogether", () => {
    expect(bookablePetIdsForCoverage([1, 3], [{ id: 1, status: "active" }])).toEqual([1]);
    expect(bookablePetIdsForCoverage([3], [{ id: 3, status: "archived" }])).toEqual([]);
  });

  it("asks about each dog once", () => {
    expect(bookablePetIdsForCoverage([1, 1], [{ id: 1, status: "active" }])).toEqual([1]);
  });
});

describe("coverageForServiceChange", () => {
  const ready = { petId: 1, bookablePetIds: [1, 2] };

  it("never covers a service a plan cannot cover, whatever the answer", () => {
    expect(coverageForServiceChange({ ...ready, serviceType: "fft", fullyCovered: true })).toBe("not-covered");
    expect(coverageForServiceChange({ ...ready, serviceType: "bath_only", fullyCovered: undefined })).toBe("not-covered");
  });

  it("is unknown while the dog list or the coverage answer is out", () => {
    expect(coverageForServiceChange({ serviceType: "classic_groom", petId: 1, bookablePetIds: null, fullyCovered: true })).toBe("unknown");
    expect(coverageForServiceChange({ ...ready, serviceType: "styled_groom", fullyCovered: undefined })).toBe("unknown");
  });

  it("uses the booking path's rule: covered only when every dog is", () => {
    expect(coverageForServiceChange({ ...ready, serviceType: "classic_groom", fullyCovered: true })).toBe("covered");
    expect(coverageForServiceChange({ ...ready, serviceType: "classic_groom", fullyCovered: false })).toBe("not-covered");
  });

  it("never covers a dog that has passed away or is archived", () => {
    expect(coverageForServiceChange({ serviceType: "classic_groom", petId: 9, bookablePetIds: [1], fullyCovered: true })).toBe("not-covered");
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

  it("says when the membership could not be checked, or nothing had loaded", () => {
    expect(notRepricedMessage({ reason: "coverage-unknown", serviceLabel: "Classic Groom", currentPrice: "110.00" }))
      .toBe("Price not changed (the membership could not be checked yet). The price is still $110.00, so check it before saving.");
    expect(notRepricedMessage({ reason: "no-pricing-data", serviceLabel: "Tidy", currentPrice: "200.00" }))
      .toBe("Price not changed (the dog's size and the price list could not be loaded). The price is still $200.00, so check it before saving.");
  });
});
