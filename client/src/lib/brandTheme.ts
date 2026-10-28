/**
 * Putting a salon's theme onto the page, and reading one out of a logo.
 *
 * The colour decisions all live in `shared/brandPalette`, which is pure
 * and tested. This file is only the two things that need a browser:
 * writing the custom properties onto `<html>`, and getting pixels out
 * of an uploaded image.
 *
 * **One applier, three callers.** Branding used to be applied in three
 * places — the Settings page, the brand dialog in the sidebar, and the
 * layout's own effect on load — and each set a different subset of the
 * variables. That is why the appointment dialog stayed violet on a pink
 * salon: none of the three set `--primary`, which is the token every
 * shadcn Button actually reads. They all route through here now, so a
 * token added for one of them cannot go missing from the other two.
 */

import { brandTokens, type BrandInput, type ThemeMode } from "@shared/brandPalette";

/** Every property this writes, so removing a theme removes all of it. */
function tokenNames(theme: BrandInput): string[] {
  return Array.from(new Set([
    ...Object.keys(brandTokens(theme, "light")),
    ...Object.keys(brandTokens(theme, "dark")),
  ]));
}

/**
 * Whether the page is currently showing dark mode.
 *
 * The theme is written as inline custom properties on the root
 * element, and an inline style beats the `.dark` rule in index.css —
 * so applying the wrong mode's neutrals leaves a page whose surfaces
 * disagree with everything drawn on them. The mode has to be read,
 * not assumed.
 *
 * Read from the `dark` class and NOTHING else, because ThemeContext
 * says of itself that it is the "ONE owner of the class on <html>".
 * It toggles `dark` and never adds a `light` class, so an earlier
 * version of this fell through to prefers-color-scheme — and for
 * anyone whose PHONE is dark while the app is light, which is the
 * app's own default, it painted dark surfaces onto a light page.
 * Megs, 28/10/2026: "my screen keeps doing weird black lines" — the
 * board's striped rows, drawn with dark-mode greys.
 *
 * Deferring to the one owner is the whole fix. A second opinion about
 * what mode the app is in is how the two disagree.
 */
function currentMode(root: HTMLElement): ThemeMode {
  return root.classList.contains("dark") ? "dark" : "light";
}

/**
 * Paint a salon's theme onto the document.
 *
 * Returns a function that takes it back off again, for the effect that
 * applied it to clean up on unmount.
 */
export function applyBrandTheme(
  theme: BrandInput & { font?: string | null },
  target?: HTMLElement,
): () => void {
  if (typeof document === "undefined") return () => {};
  const root = target ?? document.documentElement;

  const paint = () => {
    const tokens = brandTokens(theme, currentMode(root));
    for (const [name, value] of Object.entries(tokens)) {
      root.style.setProperty(name, value);
    }
    if (theme.font) root.style.setProperty("--font-sans", theme.font);
  };

  paint();

  /**
   * Repaint when the mode changes under us.
   *
   * Light and dark need different neutrals, and the theme toggle only
   * swaps a class on this same element — without watching for it, a
   * salon switching to dark mode would keep light-mode surfaces until
   * the next full reload.
   */
  const observer = new MutationObserver(paint);
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });

  // No media listener. ThemeContext already watches the system
  // preference and toggles the class when it changes, which the
  // observer above picks up — listening separately would be the same
  // second opinion that caused the problem.

  return () => {
    observer.disconnect();
    for (const name of tokenNames(theme)) root.style.removeProperty(name);
    root.style.removeProperty("--font-sans");
  };
}

/**
 * The colours in an image file, strongest first.
 *
 * Drawn to a small canvas first — 96px on the long edge. A logo is
 * commonly 2000px square, and sampling four million pixels to decide
 * one colour locks the tab up for no gain; downscaling also averages
 * away JPEG ringing, which otherwise shows up as stray hues.
 *
 * Resolves to an empty list rather than throwing, so a logo the browser
 * cannot decode simply leaves the salon's existing colours alone.
 */
export async function readLogoColours(file: Blob, maxColours = 4): Promise<string[]> {
  try {
    const { extractLogoPalette } = await import("@shared/logoPalette");
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height) || 1;
    const scale = Math.min(1, 96 / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const { data } = context.getImageData(0, 0, width, height);
    return extractLogoPalette(data, { maxColours }).map((colour) => colour.hex);
  } catch {
    return [];
  }
}

/**
 * The colours in a logo that is already in place, by URL.
 *
 * Extraction otherwise only happens at the moment of upload, which
 * leaves every salon already using Groomigo unable to get at it — they
 * would have to re-upload a logo they uploaded months ago. This is the
 * "use my logo's colours" path for a logo that is already there.
 *
 * Fetched as a blob and decoded from that, rather than pointed at an
 * `<img>`: a cross-origin image taints the canvas and `getImageData`
 * then throws, which is exactly the case for a logo served from S3.
 * A fetch either succeeds cleanly or fails loudly, and a failure
 * returns an empty list so the caller can say so.
 */
export async function readLogoColoursFromUrl(url: string, maxColours = 4): Promise<string[]> {
  try {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) return [];
    return await readLogoColours(await response.blob(), maxColours);
  } catch {
    return [];
  }
}
