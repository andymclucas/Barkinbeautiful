/**
 * sRGB ↔ OKLCH, because the whole theme is expressed in OKLCH.
 *
 * Tailwind 4 and shadcn both emit `oklch(...)` here, and the reason
 * matters for branding: OKLCH separates how light a colour is from how
 * colourful it is, so a tonal ramp can be rebuilt around a new hue
 * while keeping the lightness rhythm the design was tuned with. Doing
 * the same in RGB or HSL produces steps that look unevenly spaced —
 * HSL thinks yellow and blue at 50% lightness match, and the eye does
 * not.
 *
 * Maths is Björn Ottosson's OKLab, unchanged.
 */

export type Oklch = {
  /** Perceptual lightness, 0–1. */
  l: number;
  /** Chroma — colourfulness. 0 is grey; ~0.37 is as far as sRGB goes. */
  c: number;
  /** Hue angle in degrees, 0–360. Meaningless when c is 0. */
  h: number;
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** Linear-light RGB (0–1) to OKLCH. */
export function linearRgbToOklch(r: number, g: number, b: number): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.sqrt(A * A + B * B);
  // atan2 returns -180..180; hue is conventionally 0..360.
  const h = c < 1e-7 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** OKLCH to linear-light RGB (0–1), which may fall outside the sRGB gamut. */
export function oklchToLinearRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);

  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** "#rrggbb" (or "#rgb") to OKLCH. Unreadable input gives null. */
export function hexToOklch(hex: string): Oklch | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return linearRgbToOklch(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255));
}

/** "#rrggbb" (or "#rgb") to 0–255 channels. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3 ? value.split("").map((ch) => ch + ch).join("") : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Whether an OKLCH colour can actually be shown in sRGB. */
function inGamut(colour: Oklch): boolean {
  const [r, g, b] = oklchToLinearRgb(colour);
  const e = 1e-4;
  return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e;
}

/**
 * The same colour, with chroma reduced until sRGB can show it.
 *
 * A brand hue pushed to a lightness the gamut cannot hold would
 * otherwise clip per channel, which shifts the HUE — the one thing a
 * brand colour cannot be allowed to do. Giving up saturation instead
 * keeps it recognisably the same colour, just duller.
 */
export function clampToGamut(colour: Oklch): Oklch {
  if (colour.c <= 0 || inGamut(colour)) return colour;
  let lo = 0;
  let hi = colour.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...colour, c: mid })) lo = mid;
    else hi = mid;
  }
  return { ...colour, c: lo };
}

/** OKLCH to "#rrggbb", reducing chroma first if sRGB cannot hold it. */
export function oklchToHex(colour: Oklch): string {
  const safe = clampToGamut({
    l: clamp01(colour.l),
    c: Math.max(0, colour.c),
    h: ((colour.h % 360) + 360) % 360,
  });
  const channels = oklchToLinearRgb(safe).map((v) => {
    const n = Math.round(clamp01(linearToSrgb(clamp01(v))) * 255);
    return n.toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

/** The CSS this app's tokens are written in. */
export function formatOklch({ l, c, h }: Oklch): string {
  const round = (n: number, places: number) => Number(n.toFixed(places));
  return `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)})`;
}

/**
 * WCAG relative luminance, which is NOT OKLCH lightness.
 *
 * They disagree enough to matter: a saturated yellow and a saturated
 * blue can share an OKLCH lightness while one needs black text and the
 * other white. Contrast is a WCAG question, so it gets the WCAG
 * formula.
 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => srgbToLinear(channel / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
