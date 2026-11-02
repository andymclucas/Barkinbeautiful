/**
 * Put a payment made against an INVOICE onto the appointments it covers.
 *
 * Andy, 02/11/2026: "Check if invoices paid online mark their
 * appointments paid." They did not.
 *
 * Stripe's webhook marked the invoice paid and stopped there. The
 * payment panel's figures come from `appointment_payments` alone — it
 * fetches linked invoices to show them, but an invoice's status never
 * enters the arithmetic — so a client who paid a Pay Now link still
 * read as owing the full amount. Somebody would then chase them for
 * money they had already sent, or take it twice.
 *
 * It had never bitten: no invoice has ever been emailed, and the only
 * Stripe-paid invoice in the database is a $1 test linked to no
 * appointment. It would have started the day the invoice-email hold in
 * shared/invoiceEmailGate.ts came off, which is why it is worth fixing
 * before then rather than after.
 *
 * Nothing new is computed here. The totals come from the same
 * loadBillableTotals the panel uses, and the split across dogs is
 * `allocatePayments`, written for the emailed invoice so that a
 * household bill shows each dog what it owes. Reusing both is the point:
 * a second copy of billing maths on the money path is how two screens
 * start disagreeing about what somebody owes.
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { appointments, appointmentPayments, invoiceAppointments, invoices } from "../drizzle/schema";
import { loadBillableTotals, refreshPaymentStatus } from "./billableTotals";
import { allocateInvoicePayment } from "@shared/invoicePaymentAllocation";
import { summarisePayments } from "@shared/splitPayments";

export type PostedPayment = { appointmentId: number; amount: number };

export type PostInvoicePaymentResult = {
  /** What was written, one entry per appointment that took some of it. */
  posted: PostedPayment[];
  /**
   * Money the appointments could not absorb, in dollars.
   *
   * Always reported, never quietly posted somewhere. It means the
   * invoice is worth more than the dogs behind it still owe — a
   * membership line, a retail item, or a bill already settled at the
   * counter before the client got to the link. Inventing an
   * appointment payment for it would overstate what that dog was paid.
   */
  unallocated: number;
  /** No appointment is linked: a membership or ad-hoc invoice. */
  noAppointments: boolean;
};

/**
 * EVERY appointment this invoice covers, however it was linked.
 *
 * Two link paths exist and both are live: the completion auto-raise
 * writes only `invoices.appointment_id` and no join row at all, while a
 * combined household bill links through `invoice_appointments`, and
 * 13,051 of this salon's invoices are linked BOTH ways. Reading one and
 * not the other would post a household payment onto one dog and leave
 * its siblings owing.
 *
 * Two keyed lookups rather than one query with an OR across two outer
 * joins. The OR cannot use either index, so it scanned every appointment
 * the tenant has ever had — on a webhook, which Stripe will time out.
 */
export async function appointmentsForInvoice(db: any, tenantId: number, invoiceId: number): Promise<number[]> {
  const [direct, linked] = await Promise.all([
    db.select({ id: invoices.appointmentId })
      .from(invoices)
      .where(and(
        eq(invoices.id, invoiceId),
        eq(invoices.tenantId, tenantId),
        isNotNull(invoices.appointmentId),
      )),
    db.select({ id: invoiceAppointments.appointmentId })
      .from(invoiceAppointments)
      .where(eq(invoiceAppointments.invoiceId, invoiceId)),
  ]);

  const ids = [...new Set([...direct, ...linked].map((r: any) => Number(r.id)).filter(Boolean))] as number[];
  if (ids.length === 0) return [];

  /* The join table carries no tenant of its own, so the appointments
     are re-checked against this tenant before anything is written. */
  const owned = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.tenantId, tenantId), inArray(appointments.id, ids)))
    .orderBy(asc(appointments.id));
  return owned.map((r: any) => Number(r.id));
}

export async function postInvoicePaymentToAppointments(
  db: any,
  input: {
    tenantId: number;
    invoiceId: number;
    clientId: number;
    /** Dollars actually taken. */
    amount: number;
    /** The Stripe payment intent or session, so the row is traceable. */
    reference: string | null;
    /** What the client sees on the bill, for the note on the row. */
    invoiceNumber?: string | null;
  },
): Promise<PostInvoicePaymentResult> {
  const appointmentIds = await appointmentsForInvoice(db, input.tenantId, input.invoiceId);
  if (appointmentIds.length === 0) {
    return { posted: [], unallocated: input.amount, noAppointments: true };
  }

  const totals = await loadBillableTotals(db, appointmentIds);
  const existing = await db
    .select({ appointmentId: appointmentPayments.appointmentId, amount: appointmentPayments.amount })
    .from(appointmentPayments)
    .where(and(
      eq(appointmentPayments.tenantId, input.tenantId),
      inArray(appointmentPayments.appointmentId, appointmentIds),
    ));

  const linesByAppointment = new Map<number, { amount: string }[]>();
  for (const row of existing as any[]) {
    const list = linesByAppointment.get(row.appointmentId) ?? [];
    list.push({ amount: row.amount });
    linesByAppointment.set(row.appointmentId, list);
  }

  // Who gets what is decided by the shared rule, with its own tests.
  const { posted, unallocated } = allocateInvoicePayment(
    appointmentIds.map((id) => ({
      appointmentId: id,
      total: totals.get(id) ?? null,
      paidLines: linesByAppointment.get(id) ?? [],
    })),
    input.amount,
  );

  for (const { appointmentId, amount } of posted) {
    await db.insert(appointmentPayments).values({
      tenantId: input.tenantId,
      appointmentId,
      clientId: input.clientId,
      amount: amount.toFixed(2),
      method: "stripe",
      reference: input.reference,
      note: `Paid online against invoice ${input.invoiceNumber ?? input.invoiceId}`,
      // Nobody recorded it: the client paid Stripe directly.
      recordedByUserId: null,
    });

    /* Re-reads the PAYMENTS, so a counter payment taken while this ran
       is counted — but reuses the total already loaded above, which
       cannot have moved during one webhook and costs two more round
       trips per dog if fetched again. */
    await refreshPaymentStatus(db, input.tenantId, appointmentId, totals.get(appointmentId) ?? null);
  }

  return { posted, unallocated, noAppointments: false };
}

/**
 * What the dogs on THIS invoice still owe, in dollars.
 *
 * The figure the Pay Now link is sized by, and it has to be the same
 * one the webhook pays off or the two disagree. They did: emailInvoice
 * poured the whole booking's payments across the bills in invoice-id
 * order, while the webhook posts per invoice to that invoice's own
 * dogs. With "Separate Bills" and a part-payment taken at the counter,
 * the link on one bill was sized by money that had been paid against
 * the other — so the client paid it, the webhook found nothing owing
 * on the dogs it covered, and reception chased somebody who had paid.
 *
 * Null when no appointment is linked at all — a retail, arrears or
 * ad-hoc bill. Zero and null mean different things here: zero is "these
 * dogs owe nothing", null is "this invoice is not about dogs", and the
 * caller has to size those two differently.
 */
export async function outstandingForInvoice(
  db: any, tenantId: number, invoiceId: number,
): Promise<number | null> {
  const appointmentIds = await appointmentsForInvoice(db, tenantId, invoiceId);
  if (appointmentIds.length === 0) return null;

  const totals = await loadBillableTotals(db, appointmentIds);
  const paid = await db
    .select({ appointmentId: appointmentPayments.appointmentId, amount: appointmentPayments.amount })
    .from(appointmentPayments)
    .where(and(
      eq(appointmentPayments.tenantId, tenantId),
      inArray(appointmentPayments.appointmentId, appointmentIds),
    ));

  const byAppointment = new Map<number, { amount: string }[]>();
  for (const row of paid as any[]) {
    const list = byAppointment.get(row.appointmentId) ?? [];
    list.push({ amount: row.amount });
    byAppointment.set(row.appointmentId, list);
  }

  const cents = appointmentIds.reduce((sum, id) => {
    const owed = summarisePayments(totals.get(id) ?? null, byAppointment.get(id) ?? []).outstanding ?? 0;
    return sum + Math.max(0, Math.round(owed * 100));
  }, 0);
  return cents / 100;
}
