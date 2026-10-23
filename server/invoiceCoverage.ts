/**
 * Has this appointment already been billed?
 *
 * One question, asked from three places: automatically when a dog is
 * marked complete, from the calendar's "Create Bills" button, and from
 * the combined-invoice path that bills a whole booking at once.
 *
 * It needs its own module because the answer now lives in **two**
 * columns. Until the combined invoice existed, an invoice pointed at its
 * appointment through `invoices.appointment_id`, and counting that was
 * the whole answer. A combined invoice covers several appointments, so
 * it cannot use a single-valued column: its links live in
 * `invoice_appointments`, and `invoices.appointment_id` is NULL.
 *
 * Both older paths were still counting only the column. Raise a combined
 * bill for Pippin and Mabel, then mark either dog complete — or press
 * "Create Bills" — and the old path saw zero invoices for that
 * appointment and wrote a second one. The client gets billed twice for
 * the same groom, which is the worst class of bug this system can have.
 *
 * So the rule is centralised rather than repeated: ask here, and a
 * future third way of linking an invoice is one edit, not a hunt.
 */
import { eq, sql } from "drizzle-orm";
import { invoices, invoiceAppointments } from "../drizzle/schema";

/**
 * How many invoices already cover this appointment, counting both the
 * join table and the legacy single-appointment column.
 *
 * Deliberately a sum of both and not an either/or: a booking billed
 * per-dog before the combined path existed and then re-billed through it
 * would otherwise look uninvoiced from one side or the other.
 */
export async function countInvoicesCovering(db: any, appointmentId: number): Promise<number> {
  const [viaJoin] = await db.select({ n: sql<number>`COUNT(*)` })
    .from(invoiceAppointments).where(eq(invoiceAppointments.appointmentId, appointmentId));
  const [viaColumn] = await db.select({ n: sql<number>`COUNT(*)` })
    .from(invoices).where(eq(invoices.appointmentId, appointmentId));
  return Number(viaJoin?.n ?? 0) + Number(viaColumn?.n ?? 0);
}
