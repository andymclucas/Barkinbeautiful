/**
 * The browser-tab title: the product, then the salon using it.
 *
 * Pure because the awkward cases are all about absent or scruffy data, and a
 * tab reading "Groomigo — undefined" or "Groomigo — " is the kind of thing
 * nobody notices until a client is looking over someone's shoulder.
 */

export const PRODUCT_NAME = "Groomigo";

/** The line under the logo on the sign-in screen. */
export const GROOMIGO_TAGLINE = "The best friend for your grooming salon needs";

/** An em dash with spaces, matching how the app writes this elsewhere. */
const SEPARATOR = " — ";

/**
 * "Groomigo — Barkin Beautiful", or just "Groomigo" when no salon is known.
 *
 * A blank or whitespace-only name falls back rather than producing a trailing
 * separator: not every tenant row is guaranteed to carry a name, and the tab
 * should still read as the product.
 */
export function salonDocumentTitle(salonName: string | null | undefined): string {
  const name = (salonName ?? "").trim();
  if (!name) return PRODUCT_NAME;
  // A salon that has already named itself after the product should not read
  // "Groomigo — Groomigo".
  if (name.toLowerCase() === PRODUCT_NAME.toLowerCase()) return PRODUCT_NAME;
  return `${PRODUCT_NAME}${SEPARATOR}${collapseWhitespace(name)}`;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ");
}
