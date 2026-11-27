/**
 * Which Meta (Facebook) Pixel, if any, the public online-booking page loads.
 *
 * A pixel belongs to one salon's ad account. Groomigo serves other salons
 * too, so the id is looked up per tenant and a salon with no entry gets no
 * pixel at all. Never fall back to Barkin' Beautiful's: that would report
 * another salon's clients into Barkin' Beautiful's ads.
 *
 * Andy asked for it on 27/11/2026 to measure the booking-page ads. A setting
 * per salon is the eventual home for this; until a second salon wants one,
 * the table below is the whole of it.
 */
export const BOOKING_META_PIXEL_IDS: Readonly<Record<number, string>> = {
  1: "1917336606071879", // Barkin' Beautiful
};

/**
 * The staff preview of the booking page never loads a pixel: staff testing
 * the form are not ad visitors, and counting them would skew the numbers.
 */
export function bookingMetaPixelId(tenantId: number, options: { previewMode: boolean }): string | null {
  if (options.previewMode) return null;
  const id = BOOKING_META_PIXEL_IDS[tenantId];
  return id && /^\d+$/.test(id) ? id : null;
}

/**
 * Each salon's own privacy policy, linked from its public booking page.
 * The pixel above is why it matters: a page that loads it should say so,
 * and Barkin' Beautiful's policy has a section on the Meta Pixel.
 * A salon without an entry gets no link rather than someone else's policy.
 */
export const BOOKING_PRIVACY_URLS: Readonly<Record<number, string>> = {
  1: "https://barkinbeautiful.com.au/privacy/", // Barkin' Beautiful, live 27/11/2026
};

export function bookingPrivacyUrl(tenantId: number): string | null {
  const url = BOOKING_PRIVACY_URLS[tenantId];
  return url && url.startsWith("https://") ? url : null;
}
