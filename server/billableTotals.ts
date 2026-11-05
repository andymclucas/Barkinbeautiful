/**
 * What each dog on a booking is worth, as a figure to bill.
 *
 * Lifted out of routers/payments.ts so that the Stripe webhook can use
 * the same arithmetic without importing the router. payments.ts already
 * imports createInvoiceCheckout from stripePayments.ts, so a webhook
 * reaching back into the router would be a cycle; and a second copy of
 * the billing maths is exactly the duplication that drifts.
 */
import { and, eq, inArray } from "drizzle-orm";
import { appointments, appointmentAddOns, appointmentPayments } from "../drizzle/schema";
import { billableTotalsByAppointment, countsTowardBooking } from "@shared/appointmentAddOns";
import { derivePaymentStatus } from "@shared/splitPayments";
import { loadApprovedQuoteExtrasForAppointments } from "./groomQuoteExtras";

/** appointment id -> its billable total, or null when it is not part of one. */
export async function loadBillableTotals(db: any, appointmentIds: number[]) {
  if (appointmentIds.length === 0) return new Map<number, string | null>();

  const rows = await db
    .select({
      id: appointments.id,
      price: appointments.price,
      billedTotalOverride: appointments.billedTotalOverride,
      /* A cancelled dog is still on the panel — so a payment already
         taken against it stays visible — but owes nothing. */
      status: appointments.status,
      workflowState: appointments.workflowState,
    })
    .from(appointments)
    .where(inArray(appointments.id, appointmentIds));

  const addOns = await db
    .select({
      appointmentId: appointmentAddOns.appointmentId,
      name: appointmentAddOns.name,
      unitPrice: appointmentAddOns.unitPrice,
      quantity: appointmentAddOns.quantity,
      /* Without these the totals are computed from the full rate and a
         discounted extra is still billed — Greg Blackaby, 30/10/2026.
         addOnsTotal and appointmentTotal both read them; neither was
         being given them. */
      discountPercent: appointmentAddOns.discountPercent,
      discountAmount: appointmentAddOns.discountAmount,
    })
    .from(appointmentAddOns)
    .where(inArray(appointmentAddOns.appointmentId, appointmentIds));

  /* Work the owner agreed to mid-groom. The counter has to ask for it:
     this is the figure the panel shows, the one payments.record checks
     against and the one that sizes a Pay Now link. See
     loadApprovedQuoteExtrasForAppointments for what went wrong without
     it. */
  const quoteExtras = await loadApprovedQuoteExtrasForAppointments(db, appointmentIds);

  const totals = billableTotalsByAppointment(rows, addOns, quoteExtras);
  /* null is the existing "not part of the total" signal — see the
     comment on billableTotal. A cancelled dog takes it too. */
  for (const row of rows as any[]) {
    if (!countsTowardBooking(row)) totals.set(row.id, null);
  }
  return totals;
}

/**
 * Rewrite `appointments.paymentStatus` from the rows that now exist.
 *
 * Derived, not entered: the alternative is a status that says paid while
 * the payments say otherwise, which is the bug the payments table exists
 * to avoid. An appointment with no price keeps a null status — there is
 * nothing to measure "paid" against, and most imported history is in
 * that state.
 *
 * Re-READS the payments rather than trusting a caller's in-memory list,
 * so a payment taken at the counter a moment ago is counted too.
 *
 * `knownTotal` skips re-reading the price and its add-ons. Only pass it
 * where the figure cannot have moved underneath you — the Stripe
 * webhook loads it once and then posts to several dogs, and four round
 * trips per dog to a remote TiDB is how that request runs long enough
 * to be killed. A killed webhook is worse than a slow one: Stripe
 * retries, the retry sees the event already recorded, and the posting
 * is never repaired.
 */
export async function refreshPaymentStatus(
  db: any, tenantId: number, appointmentId: number, knownTotal?: string | null,
) {
  const [appointment] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)))
    .limit(1);
  if (!appointment) return null;

  const lines = await db
    .select({ amount: appointmentPayments.amount })
    .from(appointmentPayments)
    .where(and(
      eq(appointmentPayments.appointmentId, appointmentId),
      eq(appointmentPayments.tenantId, tenantId),
    ));

  const total = knownTotal !== undefined
    ? knownTotal
    : (await loadBillableTotals(db, [appointmentId])).get(appointmentId) ?? null;
  const status = derivePaymentStatus(total, lines);
  if (status !== null) {
    await db.update(appointments).set({ paymentStatus: status })
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));
  }
  return status;
}
