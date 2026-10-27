import { describe, it, expect } from "vitest";
import { extractLogoPalette, brandColourFromLogo } from "../shared/logoPalette";
import { hexToOklch, hexToRgb } from "../shared/oklch";

/** Build a fake logo: a list of [hex, pixelCount] plus transparent padding. */
function logo(parts: Array<[string, number]>, transparentPixels = 0): Uint8ClampedArray {
  const total = parts.reduce((n, [, count]) => n + count, 0) + transparentPixels;
  const rgba = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [hex, count] of parts) {
    const [r, g, b] = hexToRgb(hex)!;
    for (let n = 0; n < count; n++) {
      rgba[i++] = r; rgba[i++] = g; rgba[i++] = b; rgba[i++] = 255;
    }
  }
  for (let n = 0; n < transparentPixels; n++) {
    rgba[i++] = 255; rgba[i++] = 255; rgba[i++] = 255; rgba[i++] = 0;
  }
  return rgba;
}

/** How far apart two colours are in hue, respecting the wrap at 360°. */
function hueGap(a: string, b: string): number {
  const diff = Math.abs(hexToOklch(a)!.h - hexToOklch(b)!.h) % 360;
  return diff > 180 ? 360 - diff : diff;
}

describe("brandColourFromLogo", () => {
  it("finds a single-colour mark", () => {
    const found = brandColourFromLogo(logo([["#d61572", 500]], 4000))!;
    expect(hueGap(found, "#d61572")).toBeLessThan(3);
  });

  /**
   * The failure that makes a naive extractor useless. Nearly every logo
   * is a small coloured mark beside a lot of black or grey type, and
   * picking the most FREQUENT colour returns the type every time.
   */
  it("prefers a small bright mark over a large block of type", () => {
    const found = brandColourFromLogo(logo([
      ["#1a1a1a", 4000],   // the wordmark
      ["#6b6b6b", 1500],   // a grey strapline
      ["#00a86b", 300],    // the actual brand
    ]))!;
    expect(hueGap(found, "#00a86b")).toBeLessThan(5);
  });

  it("ignores the white the logo is knocked out of", () => {
    const found = brandColourFromLogo(logo([["#ffffff", 9000], ["#ff6600", 400]]))!;
    expect(hueGap(found, "#ff6600")).toBeLessThan(5);
  });

  it("ignores transparent padding", () => {
    expect(brandColourFromLogo(logo([["#7c3aed", 100]], 50000))).not.toBeNull();
  });

  /**
   * Edges blend into the background, so a quarter of a mark's pixels
   * are paler than the mark. Averaging all of them lands on a colour
   * that is in the image but is not the brand.
   */
  it("is not dragged pale by anti-aliased edges", () => {
    const found = brandColourFromLogo(logo([
      ["#d61572", 300],   // the mark
      ["#eb8ab8", 200],   // its halo
      ["#f7d0e3", 200],   // a fainter halo
    ]))!;
    const foundChroma = hexToOklch(found)!.c;
    expect(foundChroma).toBeGreaterThan(hexToOklch("#eb8ab8")!.c);
    expect(hueGap(found, "#d61572")).toBeLessThan(4);
  });

  /**
   * A greyscale logo has no brand colour, and saying so lets the caller
   * keep the existing theme instead of tinting the app with whichever
   * grey was least grey.
   */
  it("returns null for a logo with no colour in it", () => {
    expect(brandColourFromLogo(logo([["#000000", 2000], ["#ffffff", 2000], ["#888888", 500]]))).toBeNull();
    expect(brandColourFromLogo(logo([], 1000))).toBeNull();
    expect(brandColourFromLogo(new Uint8ClampedArray(0))).toBeNull();
  });

  it("averages hue around the wrap, not through the opposite colour", () => {
    // Two reds either side of 0°. The arithmetic mean would be cyan.
    const found = brandColourFromLogo(logo([["#e8003c", 400], ["#e82000", 400]]))!;
    expect(hexToOklch(found)!.c).toBeGreaterThan(0.1);
    expect(hueGap(found, "#e8003c")).toBeLessThan(25);
  });
});

describe("extractLogoPalette", () => {
  it("ranks the colours it found and reports their share", () => {
    const palette = extractLogoPalette(logo([["#d61572", 800], ["#00a86b", 200]]));
    expect(palette.length).toBeGreaterThanOrEqual(2);
    expect(hueGap(palette[0].hex, "#d61572")).toBeLessThan(5);
    expect(palette[0].share).toBeGreaterThan(palette[1].share);
    const total = palette.reduce((n, c) => n + c.share, 0);
    expect(total).toBeGreaterThan(0.9);
    expect(total).toBeLessThanOrEqual(1.0001);
  });

  it("honours maxColours", () => {
    const palette = extractLogoPalette(
      logo([["#d61572", 300], ["#00a86b", 300], ["#1f3a5f", 300], ["#ff6600", 300]]),
      { maxColours: 2 });
    expect(palette).toHaveLength(2);
  });

  it("gives every colour as a usable hex", () => {
    for (const colour of extractLogoPalette(logo([["#d61572", 300], ["#00a86b", 300]]))) {
      expect(colour.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
