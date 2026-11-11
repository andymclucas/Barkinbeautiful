/**
 * Which bills a client can pay from their portal.
 *
 * Andy, 11/11/2026: "yes, add pay now to the portal".
 *
 * Narrow on purpose. The invoice EMAIL with its pay link is still held
 * (shared/invoiceEmailGate.ts) until the figures have been checked, and a
 * Pay button would show a client the same figures. So only bills Groomigo
 * raised itself, still open, with money genuinely owing:
 *
 * - Never a MoeGo bill. 13,051 of the salon's bills were imported, all
 *   numbered INV-M…, and the import turned pre-August-2025 EXPECTED revenue
 *   into invoices — many read as unpaid when they were paid at the counter
 *   in MoeGo. A client must never be invited to pay one of those again.
 * - Never paid or cancelled.
 * - Only when the amount owing is above zero, measured the same way the
 *   Stripe webhook pays it off (server/invoicePaymentPosting.ts), so the
 *   figure charged and the figure posted are one number.
 */

const MOEGO_INVOICE_PREFIX = "INV-M";

export function isMoegoInvoice(invoiceNumber: string | null | undefined, appointmentMoegoId?: unknown): boolean {
  if (String(invoiceNumber ?? "").toUpperCase().startsWith(MOEGO_INVOICE_PREFIX)) return true;
  return appointmentMoegoId !== null && appointmentMoegoId !== undefined && String(appointmentMoegoId).trim() !== "";
}

export function portalInvoicePayable(input: {
  status: string | null | undefined;
  invoiceNumber: string | null | undefined;
  fromMoego: boolean;
  owedCents: number | null | undefined;
}): boolean {
  const status = String(input.status ?? "").toLowerCase();
  if (status === "paid" || status === "cancelled") return false;
  if (input.fromMoego || isMoegoInvoice(input.invoiceNumber)) return false;
  return typeof input.owedCents === "number" && Number.isFinite(input.owedCents) && input.owedCents > 0;
}
