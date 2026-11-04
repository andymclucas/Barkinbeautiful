import { describe, it, expect } from "vitest";
import { tierChoices, explainTier } from "@shared/priceTierChoice";
import type { PriceOption } from "@shared/groomPricing";

/** The real small styled-groom rows: $180 new, $163 regular, $145 VIP. */
const SMALL_STYLED: PriceOption[] = [
  { id: 2, name: "Full Groom (Styled) - New Client - Small", tier: "new", priceAud: "180.00", priceMode: "fixed", requiresManualPrice: false, bandSpecific: true },
  { id: 30001, name: "Full Groom (Styled) - Regular Client - Small", tier: "regular", priceAud: "163.00", priceMode: "fixed", requiresManualPrice: false, bandSpecific: true },
  { id: 18, name: "Full Groom (Styled) - VIP Client - Small", tier: "vip", priceAud: "145.00", priceMode: "fixed", requiresManualPrice: false, bandSpecific: true },
];

describe("tierChoices", () => {
  it("offers every tier with its figure", () => {
    expect(tierChoices(SMALL_STYLED, null).map((c) => [c.tier, c.priceAud])).toEqual([
      ["new", "180.00"], ["regular", "163.00"], ["vip", "145.00"],
    ]);
  });

  it("marks the tier whose price is in the box", () => {
    // Ruby, as Lauren left her: the VIP figure, typed over the default.
    const chosen = tierChoices(SMALL_STYLED, "145.00").filter((c) => c.selected);
    expect(chosen.map((c) => c.tier)).toEqual(["vip"]);
  });

  it("matches on value, not on string — 145 and 145.00 are one price", () => {
    expect(tierChoices(SMALL_STYLED, "145").find((c) => c.tier === "vip")?.selected).toBe(true);
  });

  it("selects nothing when the price was typed by hand", () => {
    expect(tierChoices(SMALL_STYLED, "150.00").some((c) => c.selected)).toBe(false);
  });

  it("selects nothing for an empty box", () => {
    expect(tierChoices(SMALL_STYLED, "").some((c) => c.selected)).toBe(false);
  });

  /*
   * Three styled Regular cells are deliberately unset in this catalogue.
   * A button that vanishes reads as a bug; a gap reads as a gap.
   */
  it("still returns a tier the price list has no row for", () => {
    const gapped = SMALL_STYLED.filter((o) => o.tier !== "regular");
    const regular = tierChoices(gapped, null).find((c) => c.tier === "regular");
    expect(regular).toMatchObject({ tier: "regular", priceAud: null, optionId: null });
    expect(tierChoices(gapped, null)).toHaveLength(3);
  });

  it("treats a quote-only row as having no figure to offer", () => {
    const quoted: PriceOption[] = [
      { id: 99, name: "Colour / Dye - VIP Client", tier: "vip", priceAud: null, priceMode: "quote", requiresManualPrice: true, bandSpecific: false },
    ];
    expect(tierChoices(quoted, null).find((c) => c.tier === "vip")?.priceAud).toBeNull();
  });

  it("prefers a band-specific row over a catch-all, as the price box does", () => {
    const mixed: PriceOption[] = [
      { id: 70, name: "Tidy - VIP Client", tier: "vip", priceAud: "88.00", priceMode: "fixed", requiresManualPrice: false, bandSpecific: false },
      { id: 71, name: "Tidy - VIP Client - Small", tier: "vip", priceAud: "100.00", priceMode: "fixed", requiresManualPrice: false, bandSpecific: true },
    ];
    expect(tierChoices(mixed, null).find((c) => c.tier === "vip")).toMatchObject({ optionId: 71, priceAud: "100.00" });
  });

  it("returns three empty tiers rather than nothing when the list cannot price it", () => {
    expect(tierChoices([], null).map((c) => c.priceAud)).toEqual([null, null, null]);
  });
});

describe("explainTier", () => {
  /*
   * Andy, 13/10/2026: "Only actual members get Bronze, everyone else
   * pays Casual." This is that rule, said out loud on the screen.
   */
  it("gives the reason a non-member is quoted the casual rate", () => {
    expect(explainTier({ tier: "new" })).toBe("New client rate — no membership on file.");
  });

  it("names the membership when there is one", () => {
    expect(explainTier({ tier: "vip", membershipTier: "gold" })).toBe("VIP client rate — Gold membership.");
  });

  it("treats a blank membership as none", () => {
    expect(explainTier({ tier: "new", membershipTier: "  " })).toContain("no membership on file");
  });
});
