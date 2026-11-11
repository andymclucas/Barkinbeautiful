/**
 * The client portal's "pay for today's appointment", server side.
 *
 * Andy, 11/11/2026: a client can pay today's booking from their portal,
 * and pay more than the bill if they like; the extra goes on their account
 * as store credit. The rules live in shared/portalAppointmentPay.ts.
 *
 * Two halves:
 *  - loadTodaysBill: what this client owes for their bookings today, and
 *    whether that bill is finished enough to be paid.
 *  - handlePortalAppointmentPayment: what happens when Stripe says the
 *    money arrived. The split between booking and credit is decided THEN,
 *    against what is owing at that moment, so money is never lost: a
 *    second payment, or one made after the bill was settled at the
 *    counter, lands on the client's account and the salon is told.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { appointments, appointmentPayments, memberships, pets, storeCreditTransactions } from "../drizzle/schema";
import { loadBillableTotals } from "./billableTotals";
import { postPaymentToAppointments } from "./invoicePaymentPosting";
import { notifyOwner } from "./ownerNotification";
import { summarisePayments } from "@shared/splitPayments";
import { brisbaneDateKey } from "@shared/localDateTime";
import { splitArrivedPayment, todaysBillReady, type TodaysDog } from "@shared/portalAppointmentPay";

export type TodaysBill = {
  appointmentIds: number[];
  dogs: Array<{ appointmentId: number; petName: string; owedCents: number; coveredByMembership: boolean }>;
  owedCents: number;
  ready: boolean;
};

/** What each of these appointments still owes, in cents. */
async function owedCentsByAppointment(db: any, tenantId: number, appointmentIds: number[]) {
  const totals = await loadBillableTotals(db, appointmentIds);
  const paid = appointmentIds.length === 0 ? [] : await db
    .select({ appointmentId: appointmentPayments.appointmentId, amount: appointmentPayments.amount })
    .from(appointmentPayments)
    .where(and(eq(appointmentPayments.tenantId, tenantId), inArray(appointmentPayments.appointmentId, appointmentIds)));
  const lines = new Map<number, { amount: string }[]>();
  for (const row of paid as any[]) {
    const list = lines.get(row.appointmentId) ?? [];
    list.push({ amount: row.amount });
    lines.set(row.appointmentId, list);
  }
  const owed = new Map<number, number>();
  for (const id of appointmentIds) {
    const outstanding = summarisePayments(totals.get(id) ?? null, lines.get(id) ?? []).outstanding ?? 0;
    owed.set(id, Math.max(0, Math.round(outstanding * 100)));
  }
  return { totals, owed };
}

/** This client's live bookings today (salon's calendar day), and what they owe. */
export async function loadTodaysBill(db: any, tenantId: number, clientId: number): Promise<TodaysBill> {
  const today = brisbaneDateKey(new Date());
  const rows = await db
    .select({
      id: appointments.id,
      petName: pets.name,
      // Covered only by a LIVE plan. A paused or ended membership still
      // linked to the booking must not make an unpriced groom read as
      // "nothing to pay" (review, 11/11/2026).
      membershipId: sql<number | null>`CASE WHEN ${memberships.status} = 'active' THEN ${appointments.membershipId} ELSE NULL END`,
    })
    .from(appointments)
    .leftJoin(pets, eq(pets.id, appointments.petId))
    .leftJoin(memberships, eq(memberships.id, appointments.membershipId))
    .where(and(
      eq(appointments.tenantId, tenantId),
      eq(appointments.clientId, clientId),
      notInArray(appointments.status, ["cancelled", "no_show"]),
      notInArray(appointments.workflowState, ["cancelled", "no_show"]),
      sql`DATE_FORMAT(CONVERT_TZ(${appointments.scheduledStart}, '+00:00', '+10:00'), '%Y-%m-%d') = ${today}`,
    ));
  const ids: number[] = rows.map((r: any) => r.id);
  if (ids.length === 0) return { appointmentIds: [], dogs: [], owedCents: 0, ready: false };

  const { totals, owed } = await owedCentsByAppointment(db, tenantId, ids);
  const dogs = rows.map((r: any) => ({
    appointmentId: r.id as number,
    petName: (r.petName as string | null) ?? "Your dog",
    owedCents: owed.get(r.id) ?? 0,
    coveredByMembership: r.membershipId !== null && r.membershipId !== undefined,
  }));
  const readiness: TodaysDog[] = rows.map((r: any) => ({
    total: totals.get(r.id) ?? null,
    coveredByMembership: r.membershipId !== null && r.membershipId !== undefined,
    owedCents: owed.get(r.id) ?? 0,
  }));
  const owedCents = dogs.reduce((sum: number, d: { owedCents: number }) => sum + d.owedCents, 0);
  return { appointmentIds: ids, dogs, owedCents, ready: todaysBillReady(readiness) };
}

/**
 * Stripe confirmed a portal payment. Put what the booking still owes
 * against it, and the rest on the client's account.
 *
 * Never throws: the stripe_events row is already written, so a throw would
 * make Stripe retry into "already handled" and the money would never be
 * posted. A failure is survivable and loud instead.
 */
export async function handlePortalAppointmentPayment(db: any, input: {
  tenantId: number;
  clientId: number;
  paidCents: number;
  appointmentIdsCsv: string;
  intendedCreditCents: number;
  reference: string;
}) {
  const money = (cents: number) => "$" + (cents / 100).toFixed(2);
  try {
    const wanted = input.appointmentIdsCsv.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    // Only this client's bookings in this salon, whatever the metadata says.
    const owned: number[] = wanted.length === 0 ? [] : (await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(
        inArray(appointments.id, wanted),
        eq(appointments.tenantId, input.tenantId),
        eq(appointments.clientId, input.clientId),
      ))).map((r: any) => r.id);

    const { owed } = await owedCentsByAppointment(db, input.tenantId, owned);
    const owingNow = owned.reduce((sum, id) => sum + (owed.get(id) ?? 0), 0);
    const split = splitArrivedPayment(input.paidCents, owingNow);

    /*
     * One transaction: the booking rows AND the credit row, or none.
     * A review on 11/11/2026 found that a dropped connection part way
     * through left some dogs posted and the credit missing, while the
     * alert below said nothing had been recorded — so staff would record
     * it again by hand and double it. All-or-nothing makes the alert true.
     */
    const creditCents = await db.transaction(async (tx: any) => {
      let unallocatedCents = 0;
      if (split.toBookingCents > 0) {
        const posting = await postPaymentToAppointments(tx, {
          tenantId: input.tenantId,
          clientId: input.clientId,
          appointmentIds: owned,
          amount: split.toBookingCents / 100,
          reference: input.reference,
          note: "Paid online in the client portal",
        });
        unallocatedCents = Math.round(posting.unallocated * 100);
      }
      const credit = split.toCreditCents + unallocatedCents;
      if (credit > 0) {
        await tx.insert(storeCreditTransactions).values({
          tenantId: input.tenantId,
          clientId: input.clientId,
          amount: (credit / 100).toFixed(2),
          type: "credit_added",
          method: "card",
          note: "Paid online in the client portal, over today's bill (Stripe " + input.reference + ")",
          createdByUserId: null,
        });
      }
      return credit as number;
    });
    const unallocatedCents = creditCents - split.toCreditCents;

    // More went to credit than the client chose: the bill was already
    // partly or fully paid when this arrived (a second payment, or the
    // counter). Not lost, but somebody should decide whether to refund.
    if (creditCents > Math.max(0, input.intendedCreditCents)) {
      await notifyOwner({
        title: "Portal payment: " + money(creditCents) + " put on store credit",
        content:
          "A client paid " + money(input.paidCents) + " online for today's appointment. " +
          money(creditCents) + " of it went on their account as store credit, " +
          (input.intendedCreditCents > 0 ? "more than the " + money(input.intendedCreditCents) + " they chose to add, " : "") +
          "because today's bill was already paid (in part or in full) when the payment arrived — " +
          "usually a second payment, or one taken at the counter as well. " +
          "Leave it on account, or refund it in Stripe — Groomigo takes a Stripe refund off their store " +
          "credit by itself, so do not adjust the credit by hand as well." +
          "\n\nStripe payment: " + input.reference,
      }).catch(() => {});
    }
    return { handled: "portal_appointment" as const, postedCents: split.toBookingCents - unallocatedCents, creditCents };
  } catch (error) {
    console.error("[stripe] portal appointment payment could not be posted", input, error);
    await notifyOwner({
      title: "Portal payment received but NOT recorded — " + money(input.paidCents),
      content:
        "A client paid " + money(input.paidCents) + " online for today's appointment and Stripe has the money, " +
        "but Groomigo could not record it — none of it, the recording is all-or-nothing — so the booking " +
        "still shows as owing. Do not chase this client; record the payment against their booking by hand.\n\n" +
        "Stripe payment: " + input.reference + "\n\n" + (error instanceof Error ? error.message : String(error)),
    }).catch(() => {});
    return { handled: "portal_appointment" as const, postedCents: 0, creditCents: 0, failed: true };
  }
}
