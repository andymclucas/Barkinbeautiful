import { describe, expect, it } from "vitest";
import { describeFutureBookingOutcome, keptBookingPrice, normalPriceWithoutMembership } from "./membershipCancelBookings";
import type { PriceCatalogueItem } from "./groomPricing";

const item = (id: number, name: string, legacyServiceType: string, weightBand: string | null, priceAud: string | null, priceMode = "fixed"): PriceCatalogueItem =>
  ({ id, name, legacyServiceType, weightBand, priceMode, priceAud, sortOrder: id });

// The shape of the real list: one row per service, size and rate.
const catalogue: PriceCatalogueItem[] = [
  item(1, "Styled Groom - Small (New Client)", "styled_groom", "0-10kg", "110.00"),
  item(2, "Styled Groom - Small (Regular Client)", "styled_groom", "0-10kg", "95.00"),
  item(3, "Styled Groom - Small (VIP Client)", "styled_groom", "0-10kg", "85.00"),
  item(4, "Classic Groom - Small (New Client)", "classic_groom", "0-10kg", "90.00"),
  item(5, "Styled Groom - Large (New Client)", "styled_groom", "17-25kg", "160.00"),
  item(6, "Colour / Dye", "colour", null, null, "quote"),
];

describe("normalPriceWithoutMembership", () => {
  it("gives the non-member rate for that service and that size", () => {
    expect(normalPriceWithoutMembership({ serviceType: "styled_groom", sizeBand: "small", catalogue }))
      .toEqual({ price: "110.00", from: "Styled Groom - Small (New Client)" });
    expect(normalPriceWithoutMembership({ serviceType: "classic_groom", sizeBand: "small", catalogue }))
      .toEqual({ price: "90.00", from: "Classic Groom - Small (New Client)" });
    expect(normalPriceWithoutMembership({ serviceType: "styled_groom", sizeBand: "large", catalogue }))
      .toEqual({ price: "160.00", from: "Styled Groom - Large (New Client)" });
  });

  it("never falls back to a member rate when the non-member row is missing", () => {
    const membersOnly = catalogue.filter((row) => row.id !== 1);
    expect(normalPriceWithoutMembership({ serviceType: "styled_groom", sizeBand: "small", catalogue: membersOnly }))
      .toEqual({ price: null, why: "not_on_price_list" });
  });

  it("leaves the price blank rather than guess a size", () => {
    expect(normalPriceWithoutMembership({ serviceType: "styled_groom", sizeBand: null, catalogue }))
      .toEqual({ price: null, why: "no_size" });
  });

  it("leaves a quote-only or unlisted service blank", () => {
    expect(normalPriceWithoutMembership({ serviceType: "colour", sizeBand: "small", catalogue }))
      .toEqual({ price: null, why: "not_on_price_list" });
    expect(normalPriceWithoutMembership({ serviceType: "bath", sizeBand: "small", catalogue }))
      .toEqual({ price: null, why: "not_on_price_list" });
  });
});

describe("describeFutureBookingOutcome", () => {
  it("says what was removed", () => {
    expect(describeFutureBookingOutcome({ choice: "remove", removed: 1, repriced: 0, needPrice: 0 })).toBe("1 future booking removed.");
    expect(describeFutureBookingOutcome({ choice: "remove", removed: 6, repriced: 0, needPrice: 0 })).toBe("6 future bookings removed.");
  });

  it("says what was kept, and what still needs a price", () => {
    expect(describeFutureBookingOutcome({ choice: "keep", removed: 0, repriced: 6, needPrice: 0 })).toBe("6 future bookings kept: 6 now at the normal price.");
    expect(describeFutureBookingOutcome({ choice: "keep", removed: 0, repriced: 0, needPrice: 1 })).toBe("1 future booking kept: 1 still needs a price.");
    expect(describeFutureBookingOutcome({ choice: "keep", removed: 0, repriced: 3, needPrice: 1, keptAsPriced: 2 }))
      .toBe("6 future bookings kept: 3 now at the normal price, 2 left at the price already on them, 1 still needs a price.");
  });

  it("says nothing about bookings when there were none", () => {
    expect(describeFutureBookingOutcome({ choice: null, removed: 0, repriced: 0, needPrice: 0 })).toBe("");
  });
});

describe("keptBookingPrice", () => {
  const normal = { price: "180.00", from: "Styled Groom - Small (New Client)" } as const;

  it("reprices a booking the membership had made nil, or that never had a price", () => {
    expect(keptBookingPrice("0.00", normal)).toEqual({ change: true, price: "180.00" });
    expect(keptBookingPrice(null, normal)).toEqual({ change: true, price: "180.00" });
    expect(keptBookingPrice("", normal)).toEqual({ change: true, price: "180.00" });
  });

  it("leaves a booking that already carries a real price alone", () => {
    expect(keptBookingPrice("110.00", normal)).toEqual({ change: false });
    expect(keptBookingPrice(145, normal)).toEqual({ change: false });
  });

  it("leaves the price blank, never nil, when no normal price can be worked out", () => {
    expect(keptBookingPrice("0.00", { price: null, why: "no_size" })).toEqual({ change: true, price: null });
  });
});
