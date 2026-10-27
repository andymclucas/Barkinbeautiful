/**
 * A whole UI theme, derived from one salon's brand colour.
 *
 * Groomigo is sold to other grooming businesses. Each one wants the app
 * to look like theirs, and none of them will hand-pick thirty colours to
 * get there — they upload a logo. This turns a single brand colour into
 * every token the interface needs, and does it in a way that keeps the
 * design's existing tuning rather than flooding the screen with one hue.
 *
 * **Why a ramp and not just a button colour.** Roughly 28 client files
 * name a Tailwind violet step directly (`bg-violet-700`,
 * `text-violet-300`). Tailwind 4 compiles each of those to
 * `var(--color-violet-700)`, so redefining the ramp at runtime
 * recolours all of them at once. The alternative — editing 28 files to
 * use semantic tokens — is a large diff that would still miss the next
 * file somebody writes in violet out of habit.
 *
 * **What this deliberately does NOT move.** `--destructive` stays red
 * in every theme. It is a semantic colour — it means "this deletes
 * something" — and a salon whose brand is green does not want a green
 * delete button. White, black and the card surfaces stay as they are
 * for the same reason: they are paper, not brand.
 *
 * **Why Tailwind's own numbers are the skeleton.** The reference ramp
 * below is Tailwind's violet scale, and only its HUE is replaced. Its
 * lightness steps are what make 300-on-950 readable and 700 a usable
 * button; invent new ones per brand and every salon gets a different
 * set of accidents. Chroma is scaled so the ramp passes through the
 * brand's own colour, which is what makes a muted navy stay muted
 * instead of arriving as a neon.
 */

import { clampToGamut, contrastRatio, formatOklch, hexToOklch, oklchToHex, type Oklch } from "./oklch";

export type RampStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

/**
 * Tailwind 4's violet scale, which the app is currently built in.
 *
 * Read straight out of the compiled stylesheet. Lightness and the shape
 * of the chroma curve are kept; hue is replaced per salon.
 */
const REFERENCE: ReadonlyArray<{ step: RampStep; l: number; c: number }> = [
  { step: 50,  l: 0.969, c: 0.016 },
  { step: 100, l: 0.943, c: 0.029 },
  { step: 200, l: 0.894, c: 0.057 },
  { step: 300, l: 0.811, c: 0.111 },
  { step: 400, l: 0.702, c: 0.183 },
  { step: 500, l: 0.606, c: 0.250 },
  { step: 600, l: 0.541, c: 0.281 },
  { step: 700, l: 0.491, c: 0.270 },
  { step: 800, l: 0.432, c: 0.232 },
  { step: 900, l: 0.380, c: 0.189 },
  { step: 950, l: 0.283, c: 0.141 },
];

export type ThemeMode = "light" | "dark";

/**
 * The app's neutral surfaces, which are not actually neutral.
 *
 * Every one of these carries a faint violet tint — hue 292 at a chroma
 * of a few hundredths. That tint is why stock Groomigo looks like one
 * designed thing rather than grey boxes, and it is also why recolouring
 * only the buttons looks wrong: a pink salon ends up with pink controls
 * floating on faintly violet paper.
 *
 * Lightness and chroma are kept exactly; only the hue moves. These are
 * the values from index.css, per mode, because the theme is written as
 * inline custom properties on the root element and inline styles beat
 * the `.dark` block — applying one mode's neutrals in the other would
 * leave dark mode with light surfaces.
 */
const NEUTRALS: Record<ThemeMode, ReadonlyArray<{ name: string; l: number; c: number }>> = {
  light: [
    { name: "--background", l: 0.985, c: 0.006 },
    { name: "--foreground", l: 0.24, c: 0.035 },
    { name: "--card-foreground", l: 0.24, c: 0.035 },
    { name: "--popover-foreground", l: 0.24, c: 0.035 },
    { name: "--secondary", l: 0.955, c: 0.018 },
    { name: "--secondary-foreground", l: 0.36, c: 0.11 },
    { name: "--accent", l: 0.945, c: 0.028 },
    { name: "--accent-foreground", l: 0.4, c: 0.14 },
    { name: "--muted", l: 0.967, c: 0.01 },
    { name: "--muted-foreground", l: 0.556, c: 0.028 },
    { name: "--border", l: 0.925, c: 0.014 },
    { name: "--input", l: 0.925, c: 0.014 },
    { name: "--sidebar-accent", l: 0.955, c: 0.022 },
    { name: "--sidebar-accent-foreground", l: 0.42, c: 0.16 },
    { name: "--sidebar-border", l: 0.935, c: 0.012 },
  ],
  dark: [
    { name: "--background", l: 0.178, c: 0.014 },
    { name: "--foreground", l: 0.958, c: 0.006 },
    { name: "--card", l: 0.222, c: 0.017 },
    { name: "--card-foreground", l: 0.958, c: 0.006 },
    { name: "--popover", l: 0.246, c: 0.019 },
    { name: "--popover-foreground", l: 0.958, c: 0.006 },
    { name: "--secondary", l: 0.281, c: 0.03 },
    { name: "--secondary-foreground", l: 0.91, c: 0.032 },
    { name: "--accent", l: 0.312, c: 0.045 },
    { name: "--accent-foreground", l: 0.93, c: 0.045 },
    { name: "--muted", l: 0.258, c: 0.017 },
    { name: "--muted-foreground", l: 0.715, c: 0.022 },
    { name: "--border", l: 0.308, c: 0.018 },
    { name: "--input", l: 0.33, c: 0.021 },
    { name: "--sidebar-accent", l: 0.268, c: 0.04 },
    { name: "--sidebar-accent-foreground", l: 0.935, c: 0.048 },
    { name: "--sidebar-border", l: 0.272, c: 0.02 },
  ],
};

/**
 * How light the primary colour needs to be to carry, per mode.
 *
 * A brand dark enough to read on paper can disappear against a dark
 * surface, which is why index.css lifts its own primary for dark mode
 * rather than reusing the light one. A salon's brand gets the same
 * treatment: the hue is theirs, the lightness is whatever the surface
 * needs.
 */
const MINIMUM_PRIMARY_LIGHTNESS: Record<ThemeMode, number> = {
  light: 0,
  dark: 0.6,
};

/**
 * Below this, a colour is grey rather than a hue.
 *
 * A black or greyscale logo has no meaningful hue — the angle it
 * reports is whatever rounding noise produced. Treating it as a real
 * hue is how a black logo ends up tinting the entire app faintly red,
 * so an achromatic brand gets an achromatic ramp instead.
 */
const ACHROMATIC = 0.02;

/** Chroma of the reference ramp at a given lightness, by interpolation. */
function referenceChromaAt(lightness: number): number {
  const sorted = [...REFERENCE].sort((a, b) => a.l - b.l);
  if (lightness <= sorted[0].l) return sorted[0].c;
  const last = sorted[sorted.length - 1];
  if (lightness >= last.l) return last.c;
  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i];
    const lo = sorted[i - 1];
    if (lightness <= hi.l) {
      const t = (lightness - lo.l) / (hi.l - lo.l);
      return lo.c + t * (hi.c - lo.c);
    }
  }
  return last.c;
}

/**
 * How colourful this brand is, relative to the reference ramp.
 *
 * Clamped at the top so a brand sitting beyond the reference curve
 * cannot drive the mid-steps out of the sRGB gamut and arrive clipped,
 * and at the bottom so a nearly-grey-but-not-grey brand still yields
 * visible affordances.
 */
function chromaScaleFor(brand: Oklch): number {
  if (brand.c < ACHROMATIC) return 0;
  const reference = referenceChromaAt(brand.l);
  if (reference <= 0) return 1;
  const scale = brand.c / reference;
  return Math.min(1.35, Math.max(0.2, scale));
}

/** One salon's tonal ramp, 50 → 950, in the shape of Tailwind's. */
export function brandRamp(brandHex: string): Record<RampStep, string> {
  const brand = hexToOklch(brandHex) ?? hexToOklch(DEFAULT_BRAND.primary)!;
  const scale = chromaScaleFor(brand);
  const hue = scale === 0 ? 0 : brand.h;

  const ramp = {} as Record<RampStep, string>;
  for (const ref of REFERENCE) {
    ramp[ref.step] = oklchToHex(clampToGamut({ l: ref.l, c: ref.c * scale, h: hue }));
  }
  return ramp;
}

/** Near-black rather than true black: pure black on a colour reads harsh. */
const INK = "#140f17";
const PAPER = "#ffffff";

/** Whichever of white or near-black is easier to read on this colour. */
export function readableOn(background: string): string {
  return contrastRatio(background, PAPER) >= contrastRatio(background, INK) ? PAPER : INK;
}

/**
 * The same colour, pushed until text of the given kind is readable on it.
 *
 * A salon whose brand is a pale mint green would otherwise get a button
 * with white text at a contrast of 1.6:1 — invisible. Their brand is
 * still the hue; what moves is only how dark the button is, and only as
 * far as it has to. Returning the original when nothing works is
 * deliberate: an impossible request should not spin.
 */
export function darkenUntilReadable(
  background: string,
  foreground: string,
  minimumRatio = 4.5,
): string {
  if (contrastRatio(background, foreground) >= minimumRatio) return background;
  const start = hexToOklch(background);
  if (!start) return background;

  // Which way to move depends on the text: white text needs a darker
  // chip, near-black text a lighter one.
  const towardsDark = contrastRatio(PAPER, foreground) < contrastRatio(INK, foreground);
  const step = towardsDark ? -0.02 : 0.02;

  let candidate = start;
  for (let i = 0; i < 50; i++) {
    const next = clampToGamut({ ...candidate, l: candidate.l + step });
    if (next.l <= 0 || next.l >= 1) break;
    candidate = next;
    if (contrastRatio(oklchToHex(candidate), foreground) >= minimumRatio) {
      return oklchToHex(candidate);
    }
  }
  return oklchToHex(candidate);
}

/** What a brand-new salon gets before it uploads anything. */
export const DEFAULT_BRAND = {
  primary: "#d61572",
  accent: "#f9d4e7",
  sidebar: "#2b1830",
} as const;

export type BrandInput = {
  primary?: string | null;
  accent?: string | null;
  sidebar?: string | null;
};

/**
 * Every CSS custom property the app should carry for this salon.
 *
 * Returned as a flat map so the caller is a loop over
 * `style.setProperty`, and so the result can be asserted on in a test
 * without a browser. The contract worth testing is not which hex comes
 * out — that changes with the design — but that button text stays
 * readable on every brand, which is the part that silently breaks.
 */
export function brandTokens(input: BrandInput, mode: ThemeMode = "light"): Record<string, string> {
  const primary = normaliseHex(input.primary) ?? DEFAULT_BRAND.primary;
  const sidebar = normaliseHex(input.sidebar) ?? deriveSidebar(primary);
  const accent = normaliseHex(input.accent) ?? deriveAccent(primary);

  const brand = hexToOklch(primary)!;
  const achromatic = brand.c < ACHROMATIC;
  const hue = achromatic ? 0 : brand.h;

  const ramp = brandRamp(primary);
  const tokens: Record<string, string> = {};

  // The Tailwind scale itself, which is what the hardcoded
  // `bg-violet-700` classes across the client resolve against.
  for (const ref of REFERENCE) {
    tokens[`--color-violet-${ref.step}`] = ramp[ref.step];
    // Pink too: its 22 uses are all pale gradient washes behind the
    // client portal and the grooming card, which are the surfaces a
    // salon's own customers see. Leaving them stock would brand the
    // staff app and not the client-facing one.
    tokens[`--color-pink-${ref.step}`] = ramp[ref.step];
  }

  // The neutral surfaces, re-tinted so the paper matches the ink.
  for (const neutral of NEUTRALS[mode]) {
    tokens[neutral.name] = formatOklch({
      l: neutral.l,
      c: achromatic ? 0 : neutral.c,
      h: hue,
    });
  }

  // shadcn's semantic tokens: every Button, Badge and focus ring.
  const litPrimary = oklchToHex(clampToGamut({
    ...brand,
    l: Math.max(brand.l, MINIMUM_PRIMARY_LIGHTNESS[mode]),
  }));
  const primaryForeground = readableOn(litPrimary);
  const readablePrimary = darkenUntilReadable(litPrimary, primaryForeground);
  tokens["--primary"] = toOklchCss(readablePrimary);
  tokens["--primary-foreground"] = toOklchCss(primaryForeground);
  tokens["--ring"] = toOklchCss(readablePrimary);
  tokens["--sidebar-primary"] = toOklchCss(readablePrimary);
  tokens["--sidebar-primary-foreground"] = toOklchCss(primaryForeground);
  tokens["--sidebar-ring"] = toOklchCss(readablePrimary);

  // This app's own brand layer, already used throughout index.css.
  tokens["--brand-primary"] = toOklchCss(readablePrimary);
  tokens["--brand-primary-strong"] = toOklchCss(
    oklchToHex(clampToGamut(shiftLightness(readablePrimary, mode === "dark" ? 0.09 : -0.09))),
  );
  tokens["--brand-accent"] = toOklchCss(accent);
  tokens["--brand-sidebar"] = toOklchCss(sidebar);

  // The sidebar is its own surface with its own foregrounds, and it is
  // the one a salon is most likely to set to something pale. Deciding
  // its text from measured contrast rather than a lightness threshold
  // is what stops a mid-tone brand producing white-on-cream navigation.
  Object.assign(tokens, sidebarTokens(sidebar));

  return tokens;
}

/** The sidebar surface and the foregrounds that stay legible on it. */
export function sidebarTokens(sidebarHex: string): Record<string, string> {
  const base = normaliseHex(sidebarHex) ?? DEFAULT_BRAND.sidebar;
  const onDark = readableOn(base) === "#ffffff";
  // Layered over the surface rather than mixed into it, so the hover
  // and border tints hold up whatever the salon chose underneath.
  const veil = (alpha: number) => (onDark ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`);

  return {
    "--color-sidebar": toOklchCss(base),
    "--color-sidebar-foreground": veil(0.9),
    "--color-sidebar-accent": veil(0.09),
    "--color-sidebar-accent-foreground": veil(0.92),
    "--color-sidebar-border": veil(0.1),
  };
}

/** A dark surface in the brand's hue, for the sidebar. */
export function deriveSidebar(primaryHex: string): string {
  const brand = hexToOklch(primaryHex);
  if (!brand) return DEFAULT_BRAND.sidebar;
  const chroma = brand.c < ACHROMATIC ? 0 : Math.min(0.055, brand.c * 0.35);
  return oklchToHex(clampToGamut({ l: 0.225, c: chroma, h: brand.h }));
}

/** A pale wash in the brand's hue, for highlights and chips. */
export function deriveAccent(primaryHex: string): string {
  const brand = hexToOklch(primaryHex);
  if (!brand) return DEFAULT_BRAND.accent;
  const chroma = brand.c < ACHROMATIC ? 0 : Math.min(0.075, brand.c * 0.32);
  return oklchToHex(clampToGamut({ l: 0.905, c: chroma, h: brand.h }));
}

function shiftLightness(hex: string, delta: number): Oklch {
  const colour = hexToOklch(hex)!;
  return { ...colour, l: Math.min(1, Math.max(0, colour.l + delta)) };
}

function toOklchCss(hex: string): string {
  return formatOklch(hexToOklch(hex)!);
}

/** A usable "#rrggbb", or null for anything this should not trust. */
export function normaliseHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const colour = hexToOklch(value);
  return colour ? oklchToHex(colour) : null;
}
