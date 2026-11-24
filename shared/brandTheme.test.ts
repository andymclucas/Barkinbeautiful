import { describe, expect, it } from "vitest";
import {
  brandThemeChoice,
  brandTokens,
  darkenUntilReadable,
  GROOMIGO_BRAND,
  GROOMIGO_GLOW,
  readableOn,
  staffBrand,
} from "./brandPalette";
import { contrastRatio } from "./oklch";

describe("brandThemeChoice", () => {
  it("is Groomigo unless the salon has chosen its own brand", () => {
    expect(brandThemeChoice(null)).toBe("groomigo");
    expect(brandThemeChoice(undefined)).toBe("groomigo");
    expect(brandThemeChoice("")).toBe("groomigo");
    expect(brandThemeChoice("Brand")).toBe("groomigo");
    expect(brandThemeChoice("groomigo")).toBe("groomigo");
    expect(brandThemeChoice("brand")).toBe("brand");
  });
});

describe("staffBrand", () => {
  const pink = { brandPrimary: "#d61572", brandAccent: "#f9d4e7", brandSidebar: "#2b1830" };

  it("paints Groomigo teal for a salon that has not opted in, whatever colours it saved", () => {
    expect(staffBrand({ ...pink, brandTheme: null })).toMatchObject({ ...GROOMIGO_BRAND, choice: "groomigo" });
    expect(staffBrand(null)).toMatchObject({ ...GROOMIGO_BRAND, choice: "groomigo" });
  });

  it("paints the salon's own colours once it chooses its brand", () => {
    expect(staffBrand({ ...pink, brandTheme: "brand" })).toEqual({
      choice: "brand",
      primary: "#d61572",
      accent: "#f9d4e7",
      sidebar: "#2b1830",
    });
  });

  it("falls back to Groomigo teal for a brand colour it cannot read", () => {
    expect(staffBrand({ brandTheme: "brand", brandPrimary: "not a colour" }).primary).toBe(GROOMIGO_BRAND.primary);
  });
});

describe("Groomigo palette", () => {
  it("is the logo's own teal, not a darkened one", () => {
    expect(GROOMIGO_BRAND.primary).toBe(GROOMIGO_GLOW);
  });

  it("letters its buttons in near-black, which reads on the bright teal", () => {
    const lettering = readableOn(GROOMIGO_BRAND.primary);
    expect(lettering).not.toBe("#ffffff");
    expect(contrastRatio(GROOMIGO_BRAND.primary, lettering)).toBeGreaterThanOrEqual(4.5);
  });

  it("darkens the teal for text, so primary-coloured words read on white", () => {
    const text = darkenUntilReadable(GROOMIGO_BRAND.primary, "#ffffff");
    expect(contrastRatio(text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(brandTokens(GROOMIGO_BRAND, "light")["--brand-text"]).toBeTruthy();
  });

  it("leaves a brand already dark enough to read as text unchanged", () => {
    expect(darkenUntilReadable("#d61572", "#ffffff")).toBe("#d61572");
  });

  it("keeps the glow readable on the sidebar it is drawn on", () => {
    expect(contrastRatio(GROOMIGO_GLOW, GROOMIGO_BRAND.sidebar)).toBeGreaterThanOrEqual(7);
  });
});
