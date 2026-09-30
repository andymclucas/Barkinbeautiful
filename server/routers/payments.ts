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
 * Everything here is `operationalProcedure`: taking payment is a salon-floor
 * job, so a receptionist or groomer on a restricted staff account must be
 * able to do it. Every procedure therefore re-checks appointment access - the
 * procedure type only proves the caller is signed in.
 */
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { router, operationalProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { appointmentPayments, appointments, clients, pets } from "../../drizzle/schema";
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
  total: number | null;
  paid: number;
  outstanding: number | null;
  status: "unpaid" | "partial" | "paid" | null;
  overpaid: boolean;
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
  const [appointment] = await db
    .select({ id: appointments.id, price: appointments.price })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!appointment) return null;
  const lines = await db
    .select({ amount: appointmentPayments.amount })
    .from(appointmentPayments)
    .where(eq(appointmentPayments.appointmentId, appointmentId));
  const status = derivePaymentStatus(appointment.price, lines);
  if (status !== null) {
    await db.update(appointments).set({ paymentStatus: status }).where(eq(appointments.id, appointmentId));
  }
  return status;
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
          ...summarisePayments(row.price, own),
          lines: own,
        };
      });

      // The booking total ignores dogs with no price rather than counting them
      // as free: a missing price is unknown, and adding it as zero would show
      // a balance of nothing owing on a booking nobody has priced yet.
      const priced = perAppointment.filter((a) => a.total !== null);
      return {
        appointments: perAppointment,
        anyUnpriced: priced.length !== perAppointment.length,
        bookingTotal: priced.reduce((sum, a) => sum + (a.total ?? 0), 0),
        bookingPaid: perAppointment.reduce((sum, a) => sum + a.paid, 0),
        bookingOutstanding: priced.reduce((sum, a) => sum + (a.outstanding ?? 0), 0),
      };
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
      const summary = summarisePayments(appointment.price, existing);
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

      const status = await refreshPaymentStatus(db, appointment.id);
      return { id: Number((result as any).insertId), amount: check.amount, paymentStatus: status };
    }),

  remove: operationalProcedure
    .input(z.object({ paymentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [line] = await db
        .select({ id: appointmentPayments.id, appointmentId: appointmentPayments.appointmentId })
        .from(appointmentPayments)
        .where(eq(appointmentPayments.id, input.paymentId))
        .limit(1);
      if (!line) throw new Error("Payment not found");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, line.appointmentId);

      await db.delete(appointmentPayments).where(eq(appointmentPayments.id, line.id));
      const status = await refreshPaymentStatus(db, line.appointmentId);
      return { success: true, paymentStatus: status };
    }),
});
