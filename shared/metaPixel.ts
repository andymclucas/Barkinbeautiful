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
