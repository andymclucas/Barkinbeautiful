import { describe, expect, it } from "vitest";
import {
  brandThemeChoice,
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
  it("keeps white button text readable on the teal", () => {
    expect(contrastRatio(GROOMIGO_BRAND.primary, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the neon glow readable on the sidebar it is drawn on", () => {
    expect(contrastRatio(GROOMIGO_GLOW, GROOMIGO_BRAND.sidebar)).toBeGreaterThanOrEqual(7);
  });

  it("puts white text on the teal, not ink", () => {
    expect(readableOn(GROOMIGO_BRAND.primary)).toBe("#ffffff");
  });
});
