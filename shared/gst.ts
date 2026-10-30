/**
 * Australian GST, on prices that already include it.
 *
 * Andy, 30/10/2026, confirmed Barkin' Beautiful is registered and that
 * the prices in the catalogue are GST-inclusive. So GST is never added
 * to a total here — it is backed OUT of one for the invoice to show.
 * A grooming price of $110 is $100 plus $10, not $110 plus $11.
 *
 * At 10% inclusive the component is the total divided by 11. The ex-GST
 * figure is then the remainder rather than its own division, so the
 * three numbers on the invoice always add up exactly: a client checking
 * $109.09 + $10.91 = $120.00 on their own calculator must get $120.00,
 * and two independent roundings do not guarantee that.
 */

/** The rate, as a fraction. Here so it is not spelled 0.1 in six places. */
export const GST_RATE = 0.1;

/** Divisor for backing GST out of a tax-inclusive amount: 1 + 1/rate. */
export const GST_INCLUSIVE_DIVISOR = 1 + 1 / GST_RATE;

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * The GST contained in a tax-inclusive amount, rounded to cents.
 *
 * Returns 0 for anything that is not a positive, finite number — a
 * membership groom is priced at 0 and a refund is not a thing this
 * invoice models, so there is nothing to apportion either way.
 */
export function gstFromInclusive(totalIncludingGst: number): number {
  if (!Number.isFinite(totalIncludingGst) || totalIncludingGst <= 0) return 0;
  return Math.round(toCents(totalIncludingGst) / GST_INCLUSIVE_DIVISOR) / 100;
}

/** What is left once GST is taken out. Always `total - gst`, to the cent. */
export function exGst(totalIncludingGst: number): number {
  if (!Number.isFinite(totalIncludingGst) || totalIncludingGst <= 0) return 0;
  return (toCents(totalIncludingGst) - toCents(gstFromInclusive(totalIncludingGst))) / 100;
}

/** The three figures an invoice prints, guaranteed to add up. */
export function gstBreakdown(totalIncludingGst: number): {
  total: number;
  gst: number;
  exGst: number;
} {
  const gst = gstFromInclusive(totalIncludingGst);
  const ex = exGst(totalIncludingGst);
  return { total: Math.round(toCents(ex) + toCents(gst)) / 100, gst, exGst: ex };
}
