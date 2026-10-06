/**
 * Whether completing an appointment should raise an invoice for it.
 *
 * Pulled out as a pure function because the same decision is made from two
 * places — automatically when a dog is marked complete, and manually from
 * "Create Bills" on the calendar — and they must not drift. The manual path
 * had neither of the first two guards below, so pressing the button twice
 * raised a second invoice for the same groom.
 */

export type InvoiceDecisionInput = {
  /** What the client pays. NULL means no figure was ever recorded. */
  price: string | number | null | undefined;
  /** Set when the groom is covered by a membership. */
  membershipId: number | null | undefined;
  /** Any invoice already raised against this appointment. */
  existingInvoiceCount: number;
  /** Where the appointment is in the workflow. */
  workflowState: string;
  /** cancelled / no_show never bill. */
  status: string;
  /**
   * What the add-ons come to, in dollars. A groom with no price recorded
   * but a $65 teeth clean done on the day is still worth billing — the
   * price check below looks at the TOTAL, or those extras would be given
   * away by a guard meant for appointments with nothing on them at all.
   */
  addOnsTotal?: string | number | null;
};

export type InvoiceDecision =
  | { invoice: true; bill: InvoiceCoverage }
  | { invoice: false; reason: InvoiceSkipReason };

/**
 * How much of the appointment the invoice is for.
 *
 * "extras_only" is a membership groom that had work done on top. The weekly
 * membership covers the groom and nothing else, so the de-matt is billed and
 * the groom is not.
 */
export type InvoiceCoverage = "everything" | "extras_only";

export type InvoiceSkipReason =
  | "already_invoiced"
  | "not_complete"
  | "cancelled"
  | "membership_covered"
  | "no_price";

export function decideAppointmentInvoice(input: InvoiceDecisionInput): InvoiceDecision {
  if (input.existingInvoiceCount > 0) return { invoice: false, reason: "already_invoiced" };
  if (input.status === "cancelled" || input.status === "no_show") return { invoice: false, reason: "cancelled" };
  if (input.workflowState !== "complete") return { invoice: false, reason: "not_complete" };

  // NULL is not zero: it means nobody recorded a figure. But add-ons are
  // recorded explicitly, so a groom with no price and a $65 teeth clean has
  // something real to bill even though the groom itself does not.
  const amount = toAmount(input.price) ?? 0;
  const extras = toAmount(input.addOnsTotal) ?? 0;

  // A membership groom is already paid for by the weekly membership charge.
  // Billing the GROOM again charges the client twice and double-counts the
  // revenue — the same reason these appointments carry no price at all. See
  // the membership rule established 05/10/2026.
  //
  // The extras are a different matter. The membership buys a groom every N
  // weeks; it does not buy a de-matt, a teeth clean or a nail paint done on
  // the day, and until 07/10/2026 those were given away silently. So a
  // membership appointment bills its extras and only its extras — stated
  // explicitly rather than leaning on the price being null, so a membership
  // groom that somehow carries a price still cannot be charged twice.
  if (input.membershipId !== null && input.membershipId !== undefined) {
    if (extras <= 0) return { invoice: false, reason: "membership_covered" };
    return { invoice: true, bill: "extras_only" };
  }

  if (amount + extras <= 0) return { invoice: false, reason: "no_price" };

  return { invoice: true, bill: "everything" };
}

function toAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The status a freshly raised invoice should carry, given what has already
 * been collected against the appointment.
 *
 * Grooms are usually paid at pickup, so an invoice raised at completion is
 * often already settled. Marking it draft in that case would show the client
 * a bill they have paid.
 */
export function invoiceStatusForPayments(total: string | number, paidSoFar: string | number): "paid" | "draft" {
  const t = toAmount(total) ?? 0;
  const p = toAmount(paidSoFar) ?? 0;
  // A rounding cent should not leave an invoice looking unpaid.
  return p + 0.005 >= t && t > 0 ? "paid" : "draft";
}

/**
 * Invoice numbers for grooms, matching what "Create Bills" already produces
 * so the two paths are indistinguishable on a statement.
 */
export function groomInvoiceNumber(petName: string | null | undefined, startedAt: Date, unique: string): string {
  const petSlug = (petName ?? "PET").toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 8);
  const d = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane", day: "2-digit", month: "2-digit", year: "2-digit",
  }).format(startedAt).replace(/\//g, "");
  return `GROOM-${petSlug}-${d}-${unique.toUpperCase()}`;
}

export const INVOICE_DUE_DAYS = 14;

export function invoiceDueAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);
}
