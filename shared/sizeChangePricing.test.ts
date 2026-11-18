import { describe, expect, it } from "vitest";
import { resolveSizePrice, sizePriceChoices } from "./sizeChangePricing";
import type { PriceCatalogueItem } from "./groomPricing";

const item = (id: number, name: string, legacyServiceType: string, weightBand: string | null, priceAud: string | null, priceMode = "fixed"): PriceCatalogueItem =>
  ({ id, name, legacyServiceType, weightBand, priceMode, priceAud, sortOrder: id });

const catalogue: PriceCatalogueItem[] = [
  item(1, "Full Groom (Styled) - New Client - Small", "styled_groom", "0-10kg", "180.00"),
  item(2, "Full Groom (Styled) - VIP Client - Small", "styled_groom", "0-10kg", "145.00"),
  item(3, "Full Groom (Styled) - Regular Client - Small", "styled_groom", "0-10kg", "163.00"),
  item(4, "Full Groom (Classic) - New Client - Small-Medium", "classic_groom", "11-13kg", "150.00"),
  item(5, "Full Groom (Classic) - Regular Client - Small-Medium", "classic_groom", "11-13kg", "135.00"),
  item(6, "Colour / Dye", "colour", null, null, "quote"),
];

describe("sizePriceChoices", () => {
  it("offers the three rates for the service at the dog's size, new then regular then VIP", () => {
    expect(sizePriceChoices({ serviceType: "styled_groom", sizeBand: "small", catalogue })).toEqual([
      { tier: "new", label: "New client", price: "180.00", from: "Full Groom (Styled) - New Client - Small" },
      { tier: "regular", label: "Regular client", price: "163.00", from: "Full Groom (Styled) - Regular Client - Small" },
      { tier: "vip", label: "VIP client", price: "145.00", from: "Full Groom (Styled) - VIP Client - Small" },
    ]);
  });

  it("leaves out a rate the price list does not have, rather than inventing one", () => {
    const choices = sizePriceChoices({ serviceType: "classic_groom", sizeBand: "small_medium", catalogue });
    expect(choices.map((choice) => choice.tier)).toEqual(["new", "regular"]);
  });

  it("offers nothing without a size, or for a service priced by quote", () => {
    expect(sizePriceChoices({ serviceType: "styled_groom", sizeBand: null, catalogue })).toEqual([]);
    expect(sizePriceChoices({ serviceType: "colour", sizeBand: "small", catalogue })).toEqual([]);
  });
});

describe("resolveSizePrice", () => {
  const choices = sizePriceChoices({ serviceType: "styled_groom", sizeBand: "small", catalogue });

  it("leaves the booking alone when staff say so", () => {
    expect(resolveSizePrice({ decision: { kind: "leave" }, choices, currentPrice: "145.00" })).toEqual({ change: false });
  });

  it("takes the price of the rate that was picked", () => {
    expect(resolveSizePrice({ decision: { kind: "tier", tier: "regular" }, choices, currentPrice: "145.00" })).toEqual({ change: true, price: "163.00" });
  });

  it("takes a price staff typed themselves", () => {
    expect(resolveSizePrice({ decision: { kind: "custom", amount: " $152.5 " }, choices, currentPrice: "145.00" })).toEqual({ change: true, price: "152.50" });
    expect(resolveSizePrice({ decision: { kind: "custom", amount: "0" }, choices, currentPrice: "145.00" })).toEqual({ change: true, price: "0.00" });
  });

  it("refuses a custom price that is blank, negative or not a number", () => {
    for (const amount of ["", "  ", "-5", "abc", "99999", "1e3", "0x10", "12.345"]) {
      const result = resolveSizePrice({ decision: { kind: "custom", amount }, choices, currentPrice: "145.00" });
      expect(result.change).toBe(false);
      expect("error" in result && result.error).toBeTruthy();
    }
  });

  it("does not count picking the price it already has as a change", () => {
    expect(resolveSizePrice({ decision: { kind: "tier", tier: "vip" }, choices, currentPrice: "145.00" })).toEqual({ change: false });
    expect(resolveSizePrice({ decision: { kind: "custom", amount: "145" }, choices, currentPrice: 145 })).toEqual({ change: false });
  });

  it("refuses a rate that is not offered for this size", () => {
    const result = resolveSizePrice({ decision: { kind: "tier", tier: "vip" }, choices: choices.filter((c) => c.tier !== "vip"), currentPrice: null });
    expect("error" in result && result.error).toBeTruthy();
  });
});
