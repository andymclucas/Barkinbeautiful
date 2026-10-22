/**
 * Black or white text on an arbitrary background.
 *
 * The pet-code catalogue lets the salon pick any colour for a badge, and
 * the chip was forcing white on all of them. White on amber (#f59e0b)
 * is about 2:1 contrast — legible on a big screen in good light and not
 * on a phone in a grooming room, which is where it is read.
 *
 * Andy's standing instruction, 22/10/2026: "ensure all text is readable
 * in every box and column." A picker that lets someone choose an
 * unreadable combination has to resolve it rather than obey it.
 *
 * Uses WCAG relative luminance, which weights green far above blue
 * because the eye does. A naive average of R, G and B calls #0000ff
 * mid-bright and picks black on it, which is unreadable.
 */

/** sRGB channel to linear, per WCAG 2.x. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 0 for black, 1 for white. Null for anything that is not a #rrggbb. */
export function relativeLuminance(hex: string | null | undefined): number | null {
  const value = String(hex ?? "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  const r = channel(parseInt(value.slice(1, 3), 16));
  const g = channel(parseInt(value.slice(3, 5), 16));
  const b = channel(parseInt(value.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two colours, for a test to assert on. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const LIGHT_TEXT = "#ffffff";
export const DARK_TEXT = "#111827";

/**
 * The text colour to put on this background: whichever actually
 * contrasts more.
 *
 * Measured, not inferred from a luminance threshold. The usual trick is
 * "black above 0.179 luminance, white below", and it is wrong for at
 * least one colour already in this app: #8b5cf6, the Drying violet,
 * sits at 0.182 — just over the line — so the threshold picks black at
 * 4.19:1 when white would give 4.23:1. Comparing the two ratios is both
 * simpler and exact.
 *
 * Returns white for an unusable value, so a malformed colour never
 * produces invisible text.
 */
export function readableTextOn(background: string | null | undefined): typeof LIGHT_TEXT | typeof DARK_TEXT {
  const onLight = contrastRatio(String(background ?? ""), LIGHT_TEXT);
  const onDark = contrastRatio(String(background ?? ""), DARK_TEXT);
  if (onLight === null || onDark === null) return LIGHT_TEXT;
  return onDark > onLight ? DARK_TEXT : LIGHT_TEXT;
}
