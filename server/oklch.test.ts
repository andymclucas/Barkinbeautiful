import { describe, it, expect } from "vitest";
import {
  hexToOklch, oklchToHex, hexToRgb, clampToGamut,
  contrastRatio, relativeLuminance, formatOklch,
} from "../shared/oklch";

describe("hexToRgb", () => {
  it("reads both lengths", () => {
    expect(hexToRgb("#ff0088")).toEqual([255, 0, 136]);
    expect(hexToRgb("#f08")).toEqual([255, 0, 136]);
    expect(hexToRgb("ff0088")).toEqual([255, 0, 136]);
  });
  it("refuses nonsense", () => {
    expect(hexToRgb("")).toBeNull();
    expect(hexToRgb("#gggggg")).toBeNull();
    expect(hexToRgb("#ff00")).toBeNull();
  });
});

describe("hexToOklch", () => {
  it("places the known anchors", () => {
    const white = hexToOklch("#ffffff")!;
    expect(white.l).toBeCloseTo(1, 2);
    expect(white.c).toBeCloseTo(0, 3);

    const black = hexToOklch("#000000")!;
    expect(black.l).toBeCloseTo(0, 3);
  });

  it("reads grey as having no chroma, at any lightness", () => {
    for (const grey of ["#808080", "#333333", "#cccccc"]) {
      expect(hexToOklch(grey)!.c).toBeLessThan(0.002);
    }
  });

  it("puts the salon's pink where Tailwind would", () => {
    const pink = hexToOklch("#d61572")!;
    expect(pink.l).toBeGreaterThan(0.5);
    expect(pink.l).toBeLessThan(0.65);
    expect(pink.c).toBeGreaterThan(0.15);
    // Pink/magenta sits near 0° in OKLCH, and hue wraps — so "close to
    // red" is a band either side of zero, not a one-sided comparison.
    expect(pink.h < 15 || pink.h > 345).toBe(true);
  });
});

describe("round trip", () => {
  /**
   * The conversion is used in both directions on every theme build, so
   * drift here would move a salon's brand colour a little further every
   * time somebody opened Settings.
   */
  it("returns the colour it was given", () => {
    const colours = [
      "#d61572", "#2b1830", "#f9d4e7", "#7c3aed", "#00a86b",
      "#ff6600", "#123456", "#ffffff", "#000000", "#808080",
    ];
    for (const hex of colours) {
      expect(oklchToHex(hexToOklch(hex)!)).toBe(hex);
    }
  });
});

describe("clampToGamut", () => {
  it("leaves a displayable colour alone", () => {
    const pink = hexToOklch("#d61572")!;
    expect(clampToGamut(pink).c).toBeCloseTo(pink.c, 6);
  });

  /**
   * Clipping per channel instead would shift the hue, and a brand
   * colour that changes hue is no longer the brand's colour.
   */
  it("gives up chroma, not hue, when sRGB cannot hold it", () => {
    const impossible = { l: 0.95, c: 0.3, h: 250 };
    const fixed = clampToGamut(impossible);
    expect(fixed.c).toBeLessThan(impossible.c);
    expect(fixed.h).toBe(impossible.h);
    expect(fixed.l).toBe(impossible.l);
  });

  it("produces something sRGB can actually show", () => {
    const hex = oklchToHex({ l: 0.95, c: 0.3, h: 250 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("contrast", () => {
  it("matches the WCAG extremes", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#d61572", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#d61572"), 10);
  });

  it("ranks luminance the way the eye does", () => {
    // Green reads far brighter than blue at the same channel value.
    expect(relativeLuminance("#00ff00")).toBeGreaterThan(relativeLuminance("#0000ff"));
  });
});

describe("formatOklch", () => {
  it("writes the CSS this app's tokens use", () => {
    expect(formatOklch({ l: 0.585, c: 0.212, h: 292 })).toBe("oklch(0.585 0.212 292)");
  });
});
