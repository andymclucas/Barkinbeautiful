/**
 * A refund made in Stripe, recorded in Groomigo (Andy, 11/11/2026).
 *
 * Stripe's `charge.refunded` carries the RUNNING total refunded on a charge.
 * What Groomigo has already undone for that payment is worked out from the
 * rows it wrote, so a second partial refund undoes only the new money and a
 * repeated event undoes nothing. The rule for what comes off where is in
 * shared/stripeRefundPlan.ts: store credit the payment bought first, then
 * the bookings, as negative lines like the payment panel's own refunds.
 *
 * Matching is by the Stripe payment intent id, which every Groomigo card
 * payment records: the counter card-on-file charge and the portal payment
 * put it in appointment_payments.reference, and the portal's store-credit
 * row names it in its note.
 *
 * Never throws (see the portal payment handler for why), and always tells
 * the owner what it did, so nobody records the same refund again by hand.
 */
import { and, eq, like, sql } from "drizzle-orm";
import { appointmentPayments, membershipPayments, storeCreditTransactions } from "../drizzle/schema";
import { refreshPaymentStatus } from "./billableTotals";
import { notifyOwner } from "./ownerNotification";
import { planStripeRefund } from "@shared/stripeRefundPlan";

const money = (cents: number) => "$" + (Math.abs(cents) / 100).toFixed(2);
const toCents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

export async function handleStripeRefund(db: any, input: {
  paymentIntentId: string | null;
  /** Stripe's running total refunded on this charge, in cents. */
  amountRefundedCents: number;
}) {
  const pi = input.paymentIntentId;
  if (!pi) return { handled: "refund_no_payment_intent" as const };
  try {
    const bookingRows: Array<{ id: number; tenantId: number; clientId: number; appointmentId: number; amount: string }> = await db
      .select({
        id: appointmentPayments.id,
        tenantId: appointmentPayments.tenantId,
        clientId: appointmentPayments.clientId,
        appointmentId: appointmentPayments.appointmentId,
        amount: appointmentPayments.amount,
      })
      .from(appointmentPayments)
      .where(eq(appointmentPayments.reference, pi));
    const creditRows: Array<{ tenantId: number; clientId: number; amount: string; type: string }> = await db
      .select({
        tenantId: storeCreditTransactions.tenantId,
        clientId: storeCreditTransactions.clientId,
        amount: storeCreditTransactions.amount,
        type: storeCreditTransactions.type,
      })
      .from(storeCreditTransactions)
      .where(like(storeCreditTransactions.note, "%" + pi + "%"));

    if (bookingRows.length === 0 && creditRows.length === 0) {
      // Not a payment Groomigo recorded against a booking or credit. A
      // membership payment is the one that matters: say so by name.
      const [membershipPayment] = await db
        .select({ membershipId: membershipPayments.membershipId })
        .from(membershipPayments)
        .where(eq(membershipPayments.stripePaymentIntentId, pi))
        .limit(1);
      if (membershipPayment) {
        await notifyOwner({
          title: "Membership payment refunded in Stripe — " + money(input.amountRefundedCents),
          content:
            "A membership payment (membership " + membershipPayment.membershipId + ") was refunded in Stripe. " +
            "Groomigo does not adjust membership billing from a refund on its own — check that membership's " +
            "payments and ledger.\n\nStripe payment: " + pi,
        }).catch(() => {});
        return { handled: "refund_membership_notified" as const };
      }
      return { handled: "refund_not_ours" as const };
    }

    const tenantId = (bookingRows[0] ?? creditRows[0]).tenantId;
    const clientId = (bookingRows[0] ?? creditRows[0]).clientId;

    // What has already been undone for this payment, and what still stands.
    const bookingRefundedCents = bookingRows.reduce((s, r) => s + Math.min(0, toCents(r.amount)), 0); // negative
    const creditAddedCents = creditRows.filter((r) => r.type === "credit_added").reduce((s, r) => s + Math.max(0, toCents(r.amount)), 0);
    // Any negative credit line naming this payment counts as already undone
    // — a refund row this wrote, or a manual adjustment staff made that
    // names the payment (as the 11/11/2026 test cleanup did).
    const creditRefundedCents = creditRows
      .filter((r) => r.type === "refund" || r.type === "adjustment")
      .reduce((s, r) => s + Math.min(0, toCents(r.amount)), 0); // negative
    const alreadyUndoneCents = -bookingRefundedCents - creditRefundedCents;
    const newRefundCents = Math.round(input.amountRefundedCents) - alreadyUndoneCents;
    if (newRefundCents <= 0) return { handled: "refund_already_recorded" as const };

    // Net standing per appointment, in the order first paid (latest LAST).
    const firstSeen = new Map<number, number>();
    const net = new Map<number, number>();
    for (const r of [...bookingRows].sort((a, b) => a.id - b.id)) {
      if (!firstSeen.has(r.appointmentId)) firstSeen.set(r.appointmentId, r.id);
      net.set(r.appointmentId, (net.get(r.appointmentId) ?? 0) + toCents(r.amount));
    }
    const bookingLines = Array.from(firstSeen.keys()).map((appointmentId) => ({ appointmentId, netCents: net.get(appointmentId) ?? 0 }));

    const plan = planStripeRefund({
      refundCents: newRefundCents,
      creditStandingCents: creditAddedCents + creditRefundedCents,
      bookingLines,
    });

    await db.transaction(async (tx: any) => {
      if (plan.creditReversalCents > 0) {
        await tx.insert(storeCreditTransactions).values({
          tenantId, clientId,
          amount: (-plan.creditReversalCents / 100).toFixed(2),
          type: "refund",
          method: "card",
          note: "Refunded in Stripe (" + pi + ")",
          createdByUserId: null,
        });
      }
      for (const r of plan.bookingReversals) {
        await tx.insert(appointmentPayments).values({
          tenantId, appointmentId: r.appointmentId, clientId,
          amount: (-r.cents / 100).toFixed(2),
          method: "stripe",
          reference: pi,
          note: "Refunded in Stripe",
          recordedByUserId: null,
        });
      }
      for (const r of plan.bookingReversals) await refreshPaymentStatus(tx, tenantId, r.appointmentId);
    });

    const [{ balance }] = await db
      .select({ balance: sql<string>`COALESCE(SUM(${storeCreditTransactions.amount}), 0)` })
      .from(storeCreditTransactions)
      .where(and(eq(storeCreditTransactions.tenantId, tenantId), eq(storeCreditTransactions.clientId, clientId)));
    const balanceCents = toCents(balance);

    const parts: string[] = [];
    if (plan.creditReversalCents > 0) parts.push(money(plan.creditReversalCents) + " taken off their store credit");
    for (const r of plan.bookingReversals) parts.push(money(r.cents) + " reversed on booking " + r.appointmentId + " (it now shows as owing)");
    await notifyOwner({
      title: "Stripe refund recorded in Groomigo — " + money(newRefundCents),
      content:
        "A refund of " + money(newRefundCents) + " made in Stripe has been recorded in Groomigo: " +
        (parts.length ? parts.join("; ") : "nothing to undo") + ". " +
        "Do not record it again in the payment panel." +
        (plan.unmatchedCents > 0 ? "\n\n" + money(plan.unmatchedCents) + " of the refund matched nothing Groomigo had recorded for this payment, so it was not applied anywhere." : "") +
        (balanceCents < 0 ? "\n\nTheir store credit is now " + "-" + money(balanceCents) + ": they had already spent credit that has now been refunded." : "") +
        "\n\nStripe payment: " + pi,
    }).catch(() => {});

    return { handled: "refund_recorded" as const, ...plan };
  } catch (error) {
    console.error("[stripe] refund could not be recorded", input, error);
    await notifyOwner({
      title: "Stripe refund NOT recorded in Groomigo — " + money(input.amountRefundedCents),
      content:
        "A refund was made in Stripe but Groomigo could not record it, so the booking and store credit still " +
        "read as before the refund. Record it by hand in the payment panel (a negative payment) and adjust " +
        "their store credit.\n\nStripe payment: " + pi + "\n\n" + (error instanceof Error ? error.message : String(error)),
    }).catch(() => {});
    return { handled: "refund_failed" as const };
  }
}
