/**
 * Reading a salon's brand colours out of the logo they upload.
 *
 * The whole point of the feature is that nobody picks thirty colours by
 * hand. They upload a logo and the app looks like theirs. This takes
 * the raw pixels and answers one question: which colour IS this brand?
 *
 * Pure, and takes a flat RGBA array rather than a canvas, so the
 * decisions below can be tested against synthetic images instead of
 * being eyeballed in a browser.
 */

import { linearRgbToOklch, oklchToHex, clampToGamut, type Oklch } from "./oklch";

export type LogoColour = {
  hex: string;
  /** Share of the logo's coloured pixels this cluster accounts for, 0–1. */
  share: number;
};

/** Pixels this deliberately does not count as brand colour. */
const IGNORE = {
  /** Transparent padding — almost every logo is mostly this. */
  minAlpha: 128,
  /** Paper, and the white knocked out behind a mark. */
  maxLightness: 0.92,
  /** Outlines, drop shadows and black type. */
  minLightness: 0.15,
  /**
   * Greys. A logo is usually a coloured mark on grey or black type, and
   * counting the type wins on pixel count every time — which is how an
   * extractor returns "dark grey" for a bright pink logo.
   */
  minChroma: 0.04,
};

/** 15° buckets: fine enough to separate pink from orange, coarse enough to survive JPEG. */
const HUE_BUCKETS = 24;

type Bucket = { pixels: Oklch[]; weight: number };

/**
 * The brand colours in a logo, strongest first.
 *
 * Ranked by pixel count WEIGHTED BY CHROMA, not by count alone. A logo
 * is usually a small saturated mark beside a lot of near-neutral type,
 * and the mark is the brand. Straight frequency returns the type.
 */
export function extractLogoPalette(
  rgba: ArrayLike<number>,
  options: { maxColours?: number } = {},
): LogoColour[] {
  const maxColours = options.maxColours ?? 4;
  const buckets = new Map<number, Bucket>();
  let considered = 0;

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < IGNORE.minAlpha) continue;
    const colour = linearRgbToOklch(
      srgbToLinear(rgba[i] / 255),
      srgbToLinear(rgba[i + 1] / 255),
      srgbToLinear(rgba[i + 2] / 255),
    );
    if (colour.l > IGNORE.maxLightness || colour.l < IGNORE.minLightness) continue;
    if (colour.c < IGNORE.minChroma) continue;

    considered++;
    const key = Math.floor((colour.h / 360) * HUE_BUCKETS) % HUE_BUCKETS;
    const bucket = buckets.get(key) ?? { pixels: [], weight: 0 };
    bucket.pixels.push(colour);
    bucket.weight += colour.c;
    buckets.set(key, bucket);
  }

  // A logo with no colour in it at all — black on transparent, or a
  // greyscale wordmark. Saying so is better than returning the least
  // grey grey and tinting the whole app with it.
  if (considered === 0) return [];

  return Array.from(buckets.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxColours)
    .map((bucket) => ({
      hex: representativeColour(bucket.pixels),
      share: bucket.pixels.length / considered,
    }))
    .filter((colour, index, all) =>
      // Two adjacent buckets can straddle one colour; keep the stronger.
      all.findIndex((other) => other.hex === colour.hex) === index);
}

/** The single colour to brand the app with, or null if the logo has none. */
export function brandColourFromLogo(rgba: ArrayLike<number>): string | null {
  return extractLogoPalette(rgba, { maxColours: 1 })[0]?.hex ?? null;
}

/**
 * One colour standing for a cluster of pixels.
 *
 * Averaging the whole cluster is wrong: a logo's edges are
 * anti-aliased against the background, so a large minority of its
 * pixels are washed-out versions of the real colour and the mean lands
 * somewhere paler than anything actually in the image. Taking the most
 * saturated quarter and averaging those recovers the colour the
 * designer chose.
 */
function representativeColour(pixels: Oklch[]): string {
  const byChroma = [...pixels].sort((a, b) => b.c - a.c);
  const core = byChroma.slice(0, Math.max(1, Math.round(byChroma.length * 0.25)));

  let sumL = 0;
  let sumC = 0;
  let sumSin = 0;
  let sumCos = 0;
  for (const pixel of core) {
    sumL += pixel.l;
    sumC += pixel.c;
    const radians = (pixel.h * Math.PI) / 180;
    sumSin += Math.sin(radians);
    sumCos += Math.cos(radians);
  }

  // Hue is an angle: averaging 350° and 10° arithmetically gives 180°,
  // the opposite colour. Averaging the unit vectors gives 0°.
  const hue = ((Math.atan2(sumSin / core.length, sumCos / core.length) * 180) / Math.PI + 360) % 360;
  return oklchToHex(clampToGamut({ l: sumL / core.length, c: sumC / core.length, h: hue }));
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
