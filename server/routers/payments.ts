/**
 * Split payments: recording the money against a booking.
 *
 * A booking is settled by one or more rows in `appointment_payments`, each
 * against a single appointment. That one shape covers everything the salon
 * actually does at the counter:
 *
 *   part cash / part card   - two rows against the same appointment
 *   one dog each            - a row against each dog's own appointment
 *   deposit then balance    - two rows, days apart
 *   refund                  - a negative row, never an edit of the original
 *
 * `appointments.paymentStatus` is recomputed from those rows on every change,
 * so it can never disagree with the money. The arithmetic itself is in
 * shared/splitPayments.ts and unit-tested there.
 *
 * Taking payment is `operationalProcedure`: it is a salon-floor job, so a
 * receptionist or groomer on a restricted staff account must be able to do
 * it. Those procedures therefore re-check appointment access - the procedure
 * type only proves the caller is signed in.
 *
 * EMAILING the invoice is `protectedProcedure`, which rejects restricted
 * staff. Sending a client their bill is a front-desk and owner job, not
 * something a groomer confined to their own dogs should be able to do: it
 * leaves the building, it cannot be unsent, and it can change a client's
 * saved email address on the way past.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { router, operationalProcedure, protectedProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import {
  appointmentAddOns, appointmentPayments, appointments, clients, pets,
  invoices, invoiceAppointments, invoiceLineItems, tenants,
  storeCreditTransactions,
} from "../../drizzle/schema";
import {
  creditEntryForPayment, reversalEntryForPayment, describeCreditShortfall,
} from "@shared/storeCreditSpend";
import { sendEmail } from "../email";
import { buildInvoiceEmail, allocatePayments, type InvoiceEmailLine } from "@shared/invoiceEmail";
import { INVOICE_EMAIL_ENABLED, INVOICE_EMAIL_HELD_MESSAGE } from "@shared/invoiceEmailGate";
import { createInvoiceCheckout } from "../stripePayments";
import { getAppBaseUrl } from "../appUrl";
import { billableTotalsByAppointment, addOnsTotal, isUsableBilledOverride, countsTowardBooking } from "@shared/appointmentAddOns";
import { requireApprovedStaffAppointmentAccess } from "../staffAccess";
import {
  PAYMENT_METHODS,
  summarisePayments,
  validatePaymentAmount,
  derivePaymentStatus,
} from "@shared/splitPayments";


/**
 * The shape the payment panel gets. Spelled out rather than inferred: the
 * drizzle helpers here take `db: any`, so without these the client sees
 * `any[]` and every field on it is unchecked.
 */
export interface BookingPaymentLine {
  id: number;
  appointmentId: number;
  clientId: number;
  amount: string;
  method: string;
  reference: string | null;
  note: string | null;
  createdAt: Date;
  payerFirstName: string | null;
  payerLastName: string | null;
}

export interface BookingAppointmentPayments {
  appointmentId: number;
  petId: number | null;
  petName: string;
  clientId: number;
  /** What price was before the discount; null when never discounted. */
  preDiscountPrice: string | null;
  discountPercent: number | null;
  discountReason: string | null;
  total: number | null;
  /** The groom on its own, before extras — for the breakdown. */
  servicePrice: number | null;
  /** This dog's OWN extras, added up. */
  addOnsTotal: number;
  /** Set when a person typed the figure instead of it being worked out. */
  billedTotalOverride: number | null;
  billedOverrideReason: string | null;
  paid: number;
  outstanding: number | null;
  status: "unpaid" | "partial" | "paid" | null;
  overpaid: boolean;
  /**
   * Cancelled or a no-show: still listed, so a payment already taken
   * against it stays visible and refundable, but owing nothing and out
   * of the booking total.
   */
  cancelled: boolean;
  lines: BookingPaymentLine[];
}

/** Every appointment in the booking: the one asked for, plus its session. */
async function loadBookingAppointments(db: any, appointmentId: number) {
  const [appointment] = await db
    .select({
      id: appointments.id,
      tenantId: appointments.tenantId,
      clientId: appointments.clientId,
      petId: appointments.petId,
      price: appointments.price,
      preDiscountPrice: appointments.preDiscountPrice,
      discountPercent: appointments.discountPercent,
      discountReason: appointments.discountReason,
      sessionId: appointments.sessionId,
      paymentStatus: appointments.paymentStatus,
    })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!appointment) throw new Error("Appointment not found");

  const rows = appointment.sessionId
    ? await db
        .select({
          id: appointments.id,
          tenantId: appointments.tenantId,
          clientId: appointments.clientId,
          petId: appointments.petId,
          price: appointments.price,
          sessionId: appointments.sessionId,
          paymentStatus: appointments.paymentStatus,
        })
        .from(appointments)
        .where(and(
          eq(appointments.tenantId, appointment.tenantId),
          eq(appointments.sessionId, appointment.sessionId),
        ))
        .orderBy(asc(appointments.id))
    : [appointment];

  return { appointment, rows };
}

async function loadLines(db: any, appointmentIds: number[]) {
  if (appointmentIds.length === 0) return [];
  return db
    .select({
      id: appointmentPayments.id,
      appointmentId: appointmentPayments.appointmentId,
      clientId: appointmentPayments.clientId,
      amount: appointmentPayments.amount,
      method: appointmentPayments.method,
      reference: appointmentPayments.reference,
      note: appointmentPayments.note,
      createdAt: appointmentPayments.createdAt,
      payerFirstName: clients.firstName,
      payerLastName: clients.lastName,
    })
    .from(appointmentPayments)
    .leftJoin(clients, eq(clients.id, appointmentPayments.clientId))
    .where(inArray(appointmentPayments.appointmentId, appointmentIds))
    .orderBy(asc(appointmentPayments.createdAt), asc(appointmentPayments.id));
}

/**
 * Rewrite `appointments.paymentStatus` from the rows that now exist.
 *
 * Derived, not entered: the alternative is a status that says paid while the
 * payments say otherwise, which is the bug this whole table exists to avoid.
 * An appointment with no price keeps a null status - there is nothing to
 * measure "paid" against, and most imported history is in that state.
 */
async function refreshPaymentStatus(db: any, appointmentId: number) {
  // Existence only — what it is WORTH comes from loadBillableTotals below,
  // which has to read the add-ons too.
  const [appointment] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!appointment) return null;
  const lines = await db
    .select({ amount: appointmentPayments.amount })
    .from(appointmentPayments)
    .where(eq(appointmentPayments.appointmentId, appointmentId));
  const totals = await loadBillableTotals(db, [appointmentId]);
  const status = derivePaymentStatus(totals.get(appointmentId) ?? null, lines);
  if (status !== null) {
    await db.update(appointments).set({ paymentStatus: status }).where(eq(appointments.id, appointmentId));
  }
  return status;
}


/**
 * What each appointment is actually worth: its price plus anything done on
 * the day.
 *
 * Every "what is owed" question in this file goes through here, because
 * answering any of them from `appointments.price` alone silently drops the
 * extras. On 07/10/2026 a $35 Extra Care on Millie's $145 groom left the
 * panel reading "owing $145", would have refused the $180 at the counter as
 * an overpayment, and would have stamped the booking paid at $145.
 *
 * Returns null for an appointment nobody has priced AND has added nothing
 * to — see billableTotal. That null is load-bearing: it keeps an unpriced
 * booking out of the totals instead of showing it as settled.
 */
async function loadBillableTotals(db: any, appointmentIds: number[]) {
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

  const totals = billableTotalsByAppointment(rows, addOns);
  /* null is the existing "not part of the total" signal — see the
     comment on billableTotal. A cancelled dog takes it too. */
  for (const row of rows as any[]) {
    if (!countsTowardBooking(row)) totals.set(row.id, null);
  }
  return totals;
}

/**
 * The parts behind each dog's figure: the groom, its own extras, and any
 * typed-in override.
 *
 * Separate from loadBillableTotals because only the panel needs it — the
 * other two callers are deriving a status and validating an amount, and
 * neither cares how the number was arrived at.
 *
 * It exists because a correct total read as wrong. On 13/10/2026 Louie and
 * Lollie were $110 each with a $65 teeth clean each, so $350 was right; but
 * the edit dialog showed only the dog being edited, so the sibling's $65 was
 * invisible and the booking looked overcharged by $65.
 */
async function loadBillingBreakdown(db: any, appointmentIds: number[]) {
  const breakdown = new Map<number, {
    servicePrice: number | null;
    addOnsTotal: number;
    billedTotalOverride: number | null;
    billedOverrideReason: string | null;
  }>();
  if (appointmentIds.length === 0) return breakdown;

  const rows = await db
    .select({
      id: appointments.id,
      price: appointments.price,
      billedTotalOverride: appointments.billedTotalOverride,
      billedOverrideReason: appointments.billedOverrideReason,
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

  const num = (value: any) =>
    value === null || value === undefined || String(value).trim() === "" ? null : Number(value);

  for (const row of rows) {
    breakdown.set(row.id, {
      servicePrice: num(row.price),
      addOnsTotal: Number(addOnsTotal(addOns.filter((a: any) => a.appointmentId === row.id))),
      billedTotalOverride: num(row.billedTotalOverride),
      billedOverrideReason: row.billedOverrideReason ?? null,
    });
  }
  return breakdown;
}


/* ── Emailing the invoice ─────────────────────────────────────────────
 *
 * Lauren, 30/10/2026: "This customer - I email the invoice to usually."
 *
 * Deliberately does NOT raise an invoice. The edit dialog already has
 * Create Bill and One Bill for All, and those run a duplicate-bill
 * guard (countInvoicesCovering) that a side-effect raise here would go
 * round. Emailing is delivery; raising is billing. If there is no bill
 * yet, this says so and names the button.
 */

/** A date in the SALON's timezone, not the server's or the reader's. */
function formatSalonDate(instant: Date | null | undefined, timeZone: string): string {
  if (!instant) return "";
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone, day: "numeric", month: "long", year: "numeric",
    }).format(instant);
  } catch {
    // An unknown timezone must not stop a bill going out.
    return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(instant);
  }
}

/**
 * EVERY invoice covering this booking, however it was linked.
 *
 * Two link paths exist and both are live: an auto-raised single invoice
 * sets only `invoices.appointment_id`, while a combined household bill
 * leaves that NULL and links through `invoice_appointments`. Reading
 * one and not the other silently misses half the bills. 13,051 of this
 * salon's invoices are in fact linked BOTH ways, so the join also has
 * to be deduplicated by invoice id.
 *
 * Plural, not singular, because "Separate Bills" raises one invoice PER
 * DOG. Taking the first of those and calling it "the" invoice would
 * email one dog's bill, mark it sent, and leave the other owing with
 * nothing on screen to say so.
 */
async function findBookingInvoices(db: any, tenantId: number, appointmentIds: number[]) {
  if (appointmentIds.length === 0) return [];
  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientId: invoices.clientId,
      total: invoices.total,
      status: invoices.status,
      dueAt: invoices.dueAt,
      createdAt: invoices.createdAt,
      emailedAt: invoices.emailedAt,
      emailedTo: invoices.emailedTo,
    })
    .from(invoices)
    .leftJoin(invoiceAppointments, eq(invoiceAppointments.invoiceId, invoices.id))
    .where(and(
      eq(invoices.tenantId, tenantId),
      sql`${invoices.status} <> 'cancelled'`,
      or(
        inArray(invoices.appointmentId, appointmentIds),
        inArray(invoiceAppointments.appointmentId, appointmentIds),
      ),
    ))
    .orderBy(asc(invoices.id));

  const seen = new Set<number>();
  return rows.filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/** Everything the email needs, gathered once so the query and the send agree. */
async function gatherInvoiceEmail(db: any, tenantId: number, appointmentId: number) {
  const { appointment, rows } = await loadBookingAppointments(db, appointmentId);
  /* loadBookingAppointments takes no tenant, and the staff-access guard
     returns early for admins — so without this an admin of one salon
     could read another salon's client name and email back out of the
     "no bill for this booking" response. Nothing could be sent that
     way, but it should not be readable either. */
  if (appointment.tenantId !== tenantId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That booking is not this salon's" });
  }
  const ids = rows.map((r: any) => r.id);

  const bookingInvoices = await findBookingInvoices(db, tenantId, ids);
  const invoice = bookingInvoices[0] ?? null;
  const [client] = await db
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
    })
    .from(clients)
    .where(and(eq(clients.id, appointment.clientId), eq(clients.tenantId, tenantId)))
    .limit(1);

  const [salon] = await db
    .select({
      name: tenants.name, abn: tenants.abn, address: tenants.address,
      phone: tenants.phone, email: tenants.email, timezone: tenants.timezone,
      brandPrimary: tenants.brandPrimary, brandAccent: tenants.brandAccent,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const paymentLines = await loadLines(db, ids);
  const paid = paymentLines.reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

  return { appointment, rows, ids, invoice, bookingInvoices, client, salon, paid };
}

export const paymentsRouter = router({
  /**
   * Everything the payment panel needs for one booking: each dog with what it
   * owes, every transaction so far, and the booking totals.
   */
  forBooking: operationalProcedure
    .input(z.object({ appointmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const { rows } = await loadBookingAppointments(db, input.appointmentId);
      const lines = await loadLines(db, rows.map((r: any) => r.id));
      const totals = await loadBillableTotals(db, rows.map((r: any) => r.id));
      const breakdown = await loadBillingBreakdown(db, rows.map((r: any) => r.id));
      const petRows = rows.some((r: any) => r.petId)
        ? await db
            .select({ id: pets.id, name: pets.name })
            .from(pets)
            .where(inArray(pets.id, rows.filter((r: any) => r.petId).map((r: any) => r.petId)))
        : [];
      const petNames = new Map<number, string>(petRows.map((p: any) => [p.id, p.name]));

      const perAppointment: BookingAppointmentPayments[] = rows.map((row: any) => {
        const own = lines.filter((line: any) => line.appointmentId === row.id);
        return {
          appointmentId: row.id,
          petId: row.petId,
          petName: row.petId ? (petNames.get(row.petId) ?? "Pet") : "Pet",
          clientId: row.clientId,
          // price is already net of any discount, so every total below —
          // and the split-bill maths — is the discounted figure.
          preDiscountPrice: row.preDiscountPrice ?? null,
          discountPercent: row.discountPercent ?? null,
          discountReason: row.discountReason ?? null,
          servicePrice: breakdown.get(row.id)?.servicePrice ?? null,
          addOnsTotal: breakdown.get(row.id)?.addOnsTotal ?? 0,
          billedTotalOverride: breakdown.get(row.id)?.billedTotalOverride ?? null,
          billedOverrideReason: breakdown.get(row.id)?.billedOverrideReason ?? null,
          ...summarisePayments(totals.get(row.id) ?? null, own),
          /* So the panel can say "cancelled" rather than leaving a dog
             looking merely unpriced. Jen Cardaci's Freddie died; the
             screen should not imply somebody forgot to price him. */
          cancelled: !countsTowardBooking(row),
          lines: own,
        };
      });

      // The booking total ignores dogs with no price rather than counting them
      // as free: a missing price is unknown, and adding it as zero would show
      // a balance of nothing owing on a booking nobody has priced yet.
      //
      // A cancelled dog is not "unpriced" — it is settled at nothing — so it
      // is kept out of that warning as well as out of the total.
      const counted = perAppointment.filter((a) => !a.cancelled);
      const priced = counted.filter((a) => a.total !== null);
      return {
        appointments: perAppointment,
        anyUnpriced: priced.length !== counted.length,
        bookingTotal: priced.reduce((sum, a) => sum + (a.total ?? 0), 0),
        bookingPaid: perAppointment.reduce((sum, a) => sum + a.paid, 0),
        bookingOutstanding: priced.reduce((sum, a) => sum + (a.outstanding ?? 0), 0),
      };
    }),

  /**
   * Type in what this dog is actually being charged.
   *
   * Andy, 13/10/2026: "Need to be able to change the payments section if
   * incorrect... manual overide always needed."
   *
   * The computed figure is right nearly always, but a price agreed at the
   * counter does not always decompose into a catalogue price and a list of
   * extras — goodwill, a job far worse than booked, an old quote honoured.
   * Staff were left reverse-engineering which component to edit until the
   * total came out right.
   *
   * Set, this REPLACES the computed total. The add-ons stay on the invoice
   * as the record of what was done; they just stop driving the figure.
   *
   * operationalProcedure: the person at the counter settling up is the
   * receptionist or the groomer, and protectedProcedure would reject a
   * restricted staff account and leave them unable to take the money.
   */
  setBilledOverride: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      /** Dollars. Null clears it and goes back to the worked-out figure. */
      amount: z.string().trim().max(20).nullable(),
      /** Why. Required when setting one — this overrides the price list. */
      reason: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const clearing = input.amount === null || input.amount.trim() === "";
      if (!clearing && !isUsableBilledOverride(input.amount)) {
        // A negative bill is a typo, not a refund. Refunds are a negative
        // PAYMENT, which `record` already handles and which leaves a line
        // on the booking saying what happened.
        throw new Error("Enter an amount of zero or more. To refund, record a negative payment instead.");
      }
      const reason = input.reason?.trim() ?? "";
      if (!clearing && reason === "") {
        // The reason is the whole audit trail. An override with no reason
        // is indistinguishable from a mis-key a year later.
        throw new Error("Say why the price is being changed");
      }

      const [appointment] = await db
        .select({ id: appointments.id, tenantId: appointments.tenantId })
        .from(appointments)
        .where(eq(appointments.id, input.appointmentId))
        .limit(1);
      if (!appointment) throw new Error("Appointment not found");

      await db.update(appointments).set(clearing ? {
        billedTotalOverride: null,
        billedOverrideReason: null,
        billedOverrideByUserId: null,
        billedOverrideAt: null,
      } : {
        billedTotalOverride: Number(input.amount).toFixed(2),
        billedOverrideReason: reason,
        billedOverrideByUserId: ctx.user?.id ?? null,
        billedOverrideAt: new Date(),
      }).where(eq(appointments.id, appointment.id));

      // Paid-in-full may have just become partial, or the reverse, so the
      // badge on the booking has to be recomputed from the new figure.
      await refreshPaymentStatus(db, appointment.id);
      return { success: true, cleared: clearing };
    }),

  record: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      /** Dollars. Negative is a refund. */
      amount: z.string().trim().min(1).max(20),
      method: z.enum(PAYMENT_METHODS),
      /** The payer, when it is not the appointment's own client. */
      payerClientId: z.number().optional(),
      reference: z.string().trim().max(255).optional(),
      note: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const [appointment] = await db
        .select({
          id: appointments.id,
          tenantId: appointments.tenantId,
          clientId: appointments.clientId,
          price: appointments.price,
        })
        .from(appointments)
        .where(eq(appointments.id, input.appointmentId))
        .limit(1);
      if (!appointment) throw new Error("Appointment not found");

      // Validate against what is in the database now, not against whatever the
      // browser last saw: two people on the salon iPad can be on the same
      // booking, and the second one must not be able to overpay it.
      const existing = await db
        .select({ amount: appointmentPayments.amount })
        .from(appointmentPayments)
        .where(eq(appointmentPayments.appointmentId, input.appointmentId));
      const totals = await loadBillableTotals(db, [input.appointmentId]);
      const summary = summarisePayments(totals.get(input.appointmentId) ?? null, existing);
      const check = validatePaymentAmount(input.amount, summary);
      if (!check.ok) throw new Error(check.error ?? "That amount cannot be recorded");

      let payerClientId = appointment.clientId;
      if (input.payerClientId && input.payerClientId !== appointment.clientId) {
        const [payer] = await db
          .select({ id: clients.id, tenantId: clients.tenantId })
          .from(clients)
          .where(eq(clients.id, input.payerClientId))
          .limit(1);
        if (!payer || payer.tenantId !== appointment.tenantId) throw new Error("That payer is not a client of this salon");
        payerClientId = payer.id;
      }

      const [result] = await db.insert(appointmentPayments).values({
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        clientId: payerClientId,
        amount: check.amount.toFixed(2),
        method: input.method,
        reference: input.reference || null,
        note: input.note || null,
        recordedByUserId: ctx.user.id,
      });

      /* Spending store credit has to come OFF the balance.
         Until 30/10/2026 it did not, so the same credit could be spent
         twice: Mike Graham's ledger read $840 with $40 already used.
         The debit goes against the PAYER, who is not always the
         appointment's own client on a household booking. */
      const creditEntry = creditEntryForPayment({
        method: input.method,
        amount: check.amount,
        appointmentId: appointment.id,
      });
      let creditBalance: number | null = null;
      let creditWarning: string | null = null;
      if (creditEntry) {
        await db.insert(storeCreditTransactions).values({
          tenantId: appointment.tenantId,
          clientId: payerClientId,
          amount: creditEntry.amount,
          type: creditEntry.type,
          appointmentId: appointment.id,
          note: creditEntry.note,
          createdByUserId: ctx.user.id,
        });
        const [row] = await db
          .select({ total: sql<string>`COALESCE(SUM(${storeCreditTransactions.amount}), 0)` })
          .from(storeCreditTransactions)
          .where(and(
            eq(storeCreditTransactions.tenantId, appointment.tenantId),
            eq(storeCreditTransactions.clientId, payerClientId),
          ));
        creditBalance = Number(row?.total ?? 0);
        /* Reported, never refused. Credit is still being carried over
           from MoeGo by hand, so a client can hold credit this system
           has not heard of — blocking would stop the counter. */
        creditWarning = describeCreditShortfall(
          creditBalance + check.amount, check.amount,
        ).message;
      }

      const status = await refreshPaymentStatus(db, appointment.id);
      return {
        id: Number((result as any).insertId),
        amount: check.amount,
        paymentStatus: status,
        creditBalance,
        creditWarning,
      };
    }),


  /**
   * What the "Email invoice" confirmation box needs to tell the truth:
   * which address it would go to, whether there IS one, what the bill
   * comes to, and whether it has already been sent.
   *
   * It never sends. Staff see the address before they commit — 73% of
   * this salon's clients have no email on file, so "is there one?" is
   * the common question, not the rare one.
   */
  invoiceEmailTarget: protectedProcedure
    .input(z.object({ tenantId: z.number().optional(), appointmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const tenantId = tenantOf(ctx, input);
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const { invoice, bookingInvoices, client, paid } =
        await gatherInvoiceEmail(db, tenantId, input.appointmentId);
      const name = [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim();
      const email = (client?.email ?? "").trim();

      if (!invoice) {
        return {
          ready: false as const,
          reason: "no-invoice" as const,
          clientId: client?.id ?? null,
          clientName: name || null,
          email: email || null,
        };
      }

      const total = Number(invoice.total ?? 0);
      const dueCents = Math.max(0, Math.round(total * 100) - Math.round(paid * 100));
      const bookingTotal = bookingInvoices.reduce(
        (sum: number, b: any) => sum + Math.round(Number(b.total ?? 0) * 100), 0);

      return {
        ready: true as const,
        reason: null,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: client?.id ?? null,
        clientName: name || null,
        /** Null means nothing is on file and the box must ask for one. */
        email: email || null,
        total,
        amountPaid: paid,
        amountDue: dueCents / 100,
        paidInFull: dueCents === 0 && total > 0,
        emailedAt: invoice.emailedAt ?? null,
        emailedTo: invoice.emailedTo ?? null,
        /* "Separate Bills" raises one per dog. The box has to say so,
           or staff send one and believe they sent them all. */
        invoiceCount: bookingInvoices.length,
        invoiceNumbers: bookingInvoices.map((i: any) => i.invoiceNumber),
        /* Across every bill, so the box does not quote the first one's
           figures for a booking that has two. */
        bookingTotal: bookingTotal / 100,
        bookingAmountDue: Math.max(0, bookingTotal - Math.round(paid * 100)) / 100,
      };
    }),

  /**
   * Send it.
   *
   * `email` is only needed when the client has none saved; passing one
   * for a client who does have an address overrides it for this send.
   * `saveToClient` writes it back, which is how the gap actually
   * closes — without it the same address is retyped every visit.
   */
  emailInvoice: protectedProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      appointmentId: z.number(),
      email: z.string().trim().email("That does not look like an email address").optional(),
      saveToClient: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      /* Held, by Andy, until the figures have been checked. FIRST, before
         anything is loaded: a hold that only covers the Resend call still
         lets a half-finished feature mark bills as emailed. */
      if (!INVOICE_EMAIL_ENABLED) {
        throw new TRPCError({ code: "FORBIDDEN", message: INVOICE_EMAIL_HELD_MESSAGE });
      }

      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const tenantId = tenantOf(ctx, input);
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const { invoice, bookingInvoices, client, salon, paid, ids } =
        await gatherInvoiceEmail(db, tenantId, input.appointmentId);

      if (!invoice) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "There is no bill for this booking yet. Create one first, then email it.",
        });
      }

      const recipient = (input.email ?? client?.email ?? "").trim();
      if (!recipient) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This client has no email address. Add one to send the invoice.",
        });
      }

      const tz = salon?.timezone ?? "Australia/Brisbane";
      const [firstAppointment] = await db
        .select({ scheduledStart: appointments.scheduledStart })
        .from(appointments)
        .where(inArray(appointments.id, ids))
        .orderBy(asc(appointments.scheduledStart))
        .limit(1);
      const servicedOn = formatSalonDate(firstAppointment?.scheduledStart, tz) || null;
      const clientName = [client?.firstName, client?.lastName].filter(Boolean).join(" ") || null;

      /* Every bill covering this booking, not just the first.
         "Separate Bills" raises one per dog, and sending one while
         marking the job done is how the second dog goes unbilled. */
      /* One pot of money, several bills. Giving it all to the first
         printed "Paid" on a bill it over-covered and told the client
         the second was still owing when they had paid. */
      const allocated = allocatePayments(
        bookingInvoices.map((b: any) => Number(b.total ?? 0)), paid,
      );

      const results: { invoiceNumber: string; paidInFull: boolean; amountDue: number; hasPayButton: boolean }[] = [];
      for (const [index, bill] of bookingInvoices.entries()) {
        /* The lines as billed, not recomputed. An invoice is a record of
           what was charged; rebuilding it from today's prices would mail
           a different document to the one in the ledger. */
        const stored = await db
          .select({
            description: invoiceLineItems.description,
            quantity: invoiceLineItems.quantity,
            lineTotal: invoiceLineItems.lineTotal,
          })
          .from(invoiceLineItems)
          .where(eq(invoiceLineItems.invoiceId, bill.id));

        const lines: InvoiceEmailLine[] = stored.map((l: any) => ({
          description: String(l.description ?? "Grooming"),
          quantity: Number(l.quantity ?? 1),
          amount: Number(l.lineTotal ?? 0),
        }));

        /* A FRESH Checkout session per send, never the stored
           `invoices.stripeCheckoutUrl`. Stripe expires a session within
           24 hours, so a URL saved when the bill was raised is usually
           dead by the time anybody emails it — and a Pay button that
           goes nowhere is worse than no button.

           It fails SOFT. Stripe being unconfigured, rate-limited or
           simply down must not stop a client getting their invoice;
           they can still pay the way they always have. */
        const owedCents = Math.max(0, Math.round(Number(bill.total ?? 0) * 100) - Math.round((allocated[index] ?? 0) * 100));
        let payUrl: string | null = null;
        if (owedCents > 0) {
          try {
            const base = getAppBaseUrl();
            const checkout = await createInvoiceCheckout({
              invoiceId: bill.id,
              invoiceNumber: bill.invoiceNumber,
              totalCents: owedCents,
              clientId: client!.id,
              clientName: clientName ?? "",
              clientEmail: recipient,
              membershipId: null,
              tenantId,
              /* A CLIENT follows this, not a staff member — so it must
                 not land them on a staff screen behind a login. */
              successUrl: `${base}/portal/invoice-paid`,
              cancelUrl: `${base}/portal/invoice-cancelled`,
            });
            payUrl = checkout.checkoutUrl ?? null;
          } catch (err) {
            console.error("[invoice email] could not create a pay link for", bill.invoiceNumber, err);
          }
        }

        const built = buildInvoiceEmail({
          salon: {
            name: salon?.name ?? "",
            abn: salon?.abn ?? null,
            address: salon?.address ?? null,
            phone: salon?.phone ?? null,
            email: salon?.email ?? null,
            brandPrimary: salon?.brandPrimary ?? null,
            brandAccent: salon?.brandAccent ?? null,
          },
          clientName,
          invoiceNumber: bill.invoiceNumber,
          issuedOn: formatSalonDate(bill.createdAt ?? new Date(), tz),
          dueOn: formatSalonDate(bill.dueAt, tz) || null,
          serviceOn: servicedOn,
          lines,
          total: Number(bill.total ?? 0),
          amountPaid: allocated[index] ?? 0,
          payUrl,
        });

        const sent = await sendEmail({
          to: recipient,
          subject: built.subject,
          html: built.html,
          // The salon's name, not "noreply", and replies reach a person.
          fromName: salon?.name ?? null,
          replyTo: salon?.email ?? null,
        });

        /* sendEmail never throws and returns false when Resend is not
           configured or rejects. Recording a send that did not happen
           would be worse than not recording one that did: staff would
           stop chasing a bill nobody ever received.

           On a multi-bill booking this stops at the first failure and
           reports how many did go, rather than claiming all of them. */
        if (!sent) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: results.length === 0
              ? "The invoice could not be sent. Nothing was recorded — try again."
              : `Sent ${results.length} of ${bookingInvoices.length}, then ${bill.invoiceNumber} failed. Only the sent ones were recorded.`,
          });
        }

        await db.update(invoices)
          .set({ emailedAt: new Date(), emailedTo: recipient })
          .where(and(eq(invoices.id, bill.id), eq(invoices.tenantId, tenantId)));

        results.push({
          invoiceNumber: bill.invoiceNumber,
          paidInFull: built.paidInFull,
          amountDue: built.amountDue,
          hasPayButton: built.hasPayButton,
        });
      }

      /* Only FILLS a gap; never replaces an address the client already
         has. The dialog only offers the tick box when there is nothing
         on file, but the procedure is reachable directly, and silently
         rewriting a client's email from a typo at the counter is not
         something a send should be able to do. */
      let savedToClient = false;
      const hadEmail = (client?.email ?? "").trim().length > 0;
      if (input.saveToClient && client?.id && !hadEmail) {
        await db.update(clients)
          .set({ email: recipient })
          .where(and(eq(clients.id, client.id), eq(clients.tenantId, tenantId)));
        savedToClient = true;
      }

      return {
        success: true,
        sentTo: recipient,
        savedToClient,
        sentCount: results.length,
        invoiceNumber: results.map((r) => r.invoiceNumber).join(", "),
        paidInFull: results.every((r) => r.paidInFull),
        amountDue: results.reduce((sum, r) => sum + r.amountDue, 0),
        /* Reported so staff know whether the client got a Pay button.
           "Did they get a link?" is the first thing asked when somebody
           says they cannot pay. */
        payButtons: results.filter((r) => r.hasPayButton).length,
      };
    }),

  remove: operationalProcedure
    .input(z.object({ paymentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [line] = await db
        .select({
          id: appointmentPayments.id,
          appointmentId: appointmentPayments.appointmentId,
          tenantId: appointmentPayments.tenantId,
          clientId: appointmentPayments.clientId,
          amount: appointmentPayments.amount,
          method: appointmentPayments.method,
        })
        .from(appointmentPayments)
        .where(eq(appointmentPayments.id, input.paymentId))
        .limit(1);
      if (!line) throw new Error("Payment not found");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, line.appointmentId);

      await db.delete(appointmentPayments).where(eq(appointmentPayments.id, line.id));

      /* Taking the payment off has to put the credit back, or removing
         a mistyped store-credit payment quietly destroys the client's
         balance. An entry, not a delete: the ledger is an audit trail
         and the original debit really did happen. */
      const back = reversalEntryForPayment({
        method: line.method,
        amount: Number(line.amount ?? 0),
        appointmentId: line.appointmentId,
      });
      if (back) {
        await db.insert(storeCreditTransactions).values({
          tenantId: line.tenantId,
          clientId: line.clientId,
          amount: back.amount,
          type: back.type,
          appointmentId: line.appointmentId,
          note: back.note,
          createdByUserId: ctx.user.id,
        });
      }

      const status = await refreshPaymentStatus(db, line.appointmentId);
      return { success: true, paymentStatus: status, creditReturned: back ? Number(back.amount) : 0 };
    }),
});
