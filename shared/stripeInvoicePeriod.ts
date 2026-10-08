/**
 * When a membership's next charge falls, read off the invoice Stripe just paid.
 *
 * A subscription invoice carries TWO periods and they are not the same thing:
 *
 *   invoice.period_start / period_end   the invoice's own window
 *   line.period.start / line.period.end the subscription period being billed
 *
 * On the FIRST invoice of a subscription the invoice-level window collapses to
 * the moment of creation — start and end are both "now". Preferring it wrote
 * the charge's own timestamp into next_billing_date, so Next Billing showed
 * the date of the LAST payment instead of the next one. Seen live on
 * 08/10/2026: the UI correctly showed 15 Oct the instant the subscription was
 * created, then the invoice.paid webhook overwrote it with that same day.
 *
 * The line item is the one that describes the week the client paid for, so it
 * wins. The invoice-level value stays as a fallback for a one-off invoice with
 * no subscription lines.
 */

export type InvoicePeriodSource = {
  period_end?: number | null;
  lines?: { data?: Array<{ period?: { start?: number | null; end?: number | null } | null }> } | null;
};

/** Unix seconds for the end of the period just billed, or null if absent. */
export function nextBillingSecondsFromInvoice(invoice: InvoicePeriodSource): number | null {
  const line = invoice.lines?.data?.[0]?.period ?? null;
  const candidates = [line?.end, invoice.period_end];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/**
 * The same thing as a Date, or null.
 *
 * Null means "leave next_billing_date alone": a period we cannot read is not a
 * reason to blank a date that was correct when the subscription was created.
 */
export function nextBillingDateFromInvoice(invoice: InvoicePeriodSource): Date | null {
  const seconds = nextBillingSecondsFromInvoice(invoice);
  return seconds === null ? null : new Date(seconds * 1000);
}
