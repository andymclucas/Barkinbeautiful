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
 * row names it in its note as "(Stripe pi_…)".
 *
 * Guards, from the review of the first version:
 * - Never more than is really there. Each booking reversal is capped at what
 *   that booking has paid by ANY method — so a refund staff already keyed
 *   into the payment panel (with no reference) is not taken off twice — and
 *   the credit reversal at the client's actual balance.
 * - One refund at a time per client. Two partial refunds delivered at the
 *   same moment both read "nothing undone yet" and both applied in full;
 *   the reads now happen inside the transaction behind a lock on the
 *   client's row.
 * - Rows that disagree about the salon are refused, not guessed at.
 *
 * Never throws (see the portal payment handler for why), and always tells
 * the owner what it did — or that it matched nothing — so nobody records the
 * same refund again by hand.
 */
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { appointmentPayments, clients, membershipPayments, storeCreditTransactions } from "../drizzle/schema";
import { refreshPaymentStatus } from "./billableTotals";
import { notifyOwner } from "./ownerNotification";
import { planStripeRefund } from "@shared/stripeRefundPlan";

const money = (cents: number) => "$" + (Math.abs(cents) / 100).toFixed(2);
const toCents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

/** Notes that name this payment the way Groomigo writes them: "(Stripe pi_…)" or "(pi_…)". */
const namesPayment = (pi: string) => or(
  like(storeCreditTransactions.note, "%(Stripe " + pi + ")%"),
  like(storeCreditTransactions.note, "%(" + pi + ")%"),
);

async function readPayment(dbOrTx: any, pi: string) {
  const bookingRows: Array<{ id: number; tenantId: number; clientId: number; appointmentId: number; amount: string }> = await dbOrTx
    .select({
      id: appointmentPayments.id,
      tenantId: appointmentPayments.tenantId,
      clientId: appointmentPayments.clientId,
      appointmentId: appointmentPayments.appointmentId,
      amount: appointmentPayments.amount,
    })
    .from(appointmentPayments)
    .where(eq(appointmentPayments.reference, pi));
  const creditRows: Array<{ tenantId: number; clientId: number; amount: string; type: string }> = await dbOrTx
    .select({
      tenantId: storeCreditTransactions.tenantId,
      clientId: storeCreditTransactions.clientId,
      amount: storeCreditTransactions.amount,
      type: storeCreditTransactions.type,
    })
    .from(storeCreditTransactions)
    .where(namesPayment(pi));
  return { bookingRows, creditRows };
}

export async function handleStripeRefund(db: any, input: {
  paymentIntentId: string | null;
  /** Stripe's running total refunded on this charge, in cents. */
  amountRefundedCents: number;
}) {
  const pi = input.paymentIntentId;
  if (!pi) return { handled: "refund_no_payment_intent" as const };
  try {
    const first = await readPayment(db, pi);

    if (first.bookingRows.length === 0 && first.creditRows.length === 0) {
      const [membershipPayment] = await db
        .select({ membershipId: membershipPayments.membershipId })
        .from(membershipPayments)
        .where(eq(membershipPayments.stripePaymentIntentId, pi))
        .limit(1);
      await notifyOwner({
        title: (membershipPayment ? "Membership payment" : "Stripe payment") + " refunded — check Groomigo by hand (" + money(input.amountRefundedCents) + ")",
        content: membershipPayment
          ? "A membership payment (membership " + membershipPayment.membershipId + ") was refunded in Stripe. Groomigo does not " +
            "adjust membership billing from a refund on its own — check that membership's payments and ledger.\n\nStripe payment: " + pi
          : "A refund was made in Stripe on a payment Groomigo has no booking or store-credit record of — for example a bill " +
            "with no booking behind it. Nothing was changed in Groomigo; check the client's bill and adjust it by hand if needed." +
            "\n\nStripe payment: " + pi,
      }).catch(() => {});
      return { handled: membershipPayment ? "refund_membership_notified" as const : "refund_unmatched_notified" as const };
    }

    const tenants = new Set([...first.bookingRows, ...first.creditRows].map((r) => r.tenantId));
    if (tenants.size !== 1) {
      await notifyOwner({
        title: "Stripe refund NOT recorded — its records span more than one salon",
        content: "A refund on Stripe payment " + pi + " matched records in more than one salon, so Groomigo changed nothing. Check it by hand.",
      }).catch(() => {});
      return { handled: "refund_ambiguous" as const };
    }
    const tenantId = [...tenants][0];
    const lockClientId = (first.bookingRows[0] ?? first.creditRows[0]).clientId;

    const outcome = await db.transaction(async (tx: any) => {
      // One refund at a time for this client: the reads below are only
      // trustworthy if a second refund cannot write between them and ours.
      await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, lockClientId)).for("update");
      const { bookingRows, creditRows } = await readPayment(tx, pi);

      const bookingRefundedCents = bookingRows.reduce((s, r) => s + Math.min(0, toCents(r.amount)), 0); // negative
      const creditAddedCents = creditRows.filter((r) => r.type === "credit_added").reduce((s, r) => s + Math.max(0, toCents(r.amount)), 0);
      // A refund row this wrote, or a manual adjustment that names the
      // payment (as the 11/11/2026 test cleanup did), counts as undone.
      const creditRefundedCents = creditRows
        .filter((r) => r.type === "refund" || r.type === "adjustment")
        .reduce((s, r) => s + Math.min(0, toCents(r.amount)), 0); // negative
      const newRefundCents = Math.round(input.amountRefundedCents) - (-bookingRefundedCents - creditRefundedCents);
      if (newRefundCents <= 0) return { kind: "already" as const };

      // Per appointment: what THIS payment still stands at, capped by what
      // the booking has paid in total by any method — so a refund already
      // keyed into the panel without a reference is not taken twice.
      const appointmentIds = Array.from(new Set(bookingRows.map((r) => r.appointmentId)));
      const allPaid = appointmentIds.length === 0 ? [] : await tx
        .select({ appointmentId: appointmentPayments.appointmentId, amount: appointmentPayments.amount })
        .from(appointmentPayments)
        .where(inArray(appointmentPayments.appointmentId, appointmentIds));
      const paidTotal = new Map<number, number>();
      for (const r of allPaid as any[]) paidTotal.set(r.appointmentId, (paidTotal.get(r.appointmentId) ?? 0) + toCents(r.amount));
      const firstSeen = new Map<number, { id: number; clientId: number }>();
      const piNet = new Map<number, number>();
      for (const r of [...bookingRows].sort((a, b) => a.id - b.id)) {
        if (!firstSeen.has(r.appointmentId)) firstSeen.set(r.appointmentId, { id: r.id, clientId: r.clientId });
        piNet.set(r.appointmentId, (piNet.get(r.appointmentId) ?? 0) + toCents(r.amount));
      }
      const bookingLines = Array.from(firstSeen.keys()).map((appointmentId) => ({
        appointmentId,
        netCents: Math.max(0, Math.min(piNet.get(appointmentId) ?? 0, paidTotal.get(appointmentId) ?? 0)),
      }));

      // Credit: what this payment added and has not been undone, capped at
      // what the client actually holds now.
      const creditClientId = creditRows[0]?.clientId ?? lockClientId;
      const [{ balance }] = await tx
        .select({ balance: sql<string>`COALESCE(SUM(${storeCreditTransactions.amount}), 0)` })
        .from(storeCreditTransactions)
        .where(and(eq(storeCreditTransactions.tenantId, tenantId), eq(storeCreditTransactions.clientId, creditClientId)));
      const creditStanding = Math.max(0, Math.min(creditAddedCents + creditRefundedCents, toCents(balance)));
      const creditCappedByBalance = creditAddedCents + creditRefundedCents > creditStanding;

      const plan = planStripeRefund({ refundCents: newRefundCents, creditStandingCents: creditStanding, bookingLines });

      if (plan.creditReversalCents > 0) {
        await tx.insert(storeCreditTransactions).values({
          tenantId, clientId: creditClientId,
          amount: (-plan.creditReversalCents / 100).toFixed(2),
          type: "refund",
          method: "card",
          note: "Refunded in Stripe (" + pi + ")",
          createdByUserId: null,
        });
      }
      for (const r of plan.bookingReversals) {
        await tx.insert(appointmentPayments).values({
          tenantId, appointmentId: r.appointmentId,
          clientId: firstSeen.get(r.appointmentId)?.clientId ?? lockClientId,
          amount: (-r.cents / 100).toFixed(2),
          method: "stripe",
          reference: pi,
          note: "Refunded in Stripe",
          recordedByUserId: null,
        });
      }
      for (const r of plan.bookingReversals) await refreshPaymentStatus(tx, tenantId, r.appointmentId);
      return { kind: "recorded" as const, newRefundCents, plan, creditCappedByBalance };
    });

    if (outcome.kind === "already") return { handled: "refund_already_recorded" as const };
    const { newRefundCents, plan, creditCappedByBalance } = outcome;

    const parts: string[] = [];
    if (plan.creditReversalCents > 0) parts.push(money(plan.creditReversalCents) + " taken off their store credit");
    for (const r of plan.bookingReversals) parts.push(money(r.cents) + " reversed on booking " + r.appointmentId + " (it now shows as owing)");
    await notifyOwner({
      title: "Stripe refund recorded in Groomigo — " + money(newRefundCents),
      content:
        "A refund of " + money(newRefundCents) + " made in Stripe has been recorded in Groomigo: " +
        (parts.length ? parts.join("; ") : "nothing needed undoing") + ". " +
        "Do not record it again in the payment panel or adjust their store credit for it." +
        (plan.unmatchedCents > 0
          ? "\n\n" + money(plan.unmatchedCents) + " of the refund was not applied anywhere: it is more than Groomigo still shows " +
            "against this payment" + (creditCappedByBalance ? " (they had already spent some of the credit it bought)" : "") +
            ", usually because it was already undone by hand. Check their booking and store credit."
          : "") +
        "\n\nStripe payment: " + pi,
    }).catch(() => {});

    return { handled: "refund_recorded" as const, ...plan };
  } catch (error) {
    console.error("[stripe] refund could not be recorded", input, error);
    await notifyOwner({
      title: "Stripe refund NOT recorded in Groomigo — " + money(input.amountRefundedCents),
      content:
        "A refund was made in Stripe but Groomigo could not record it — none of it, the recording is all-or-nothing — so the " +
        "booking and store credit still read as before the refund. Record it by hand in the payment panel (a negative payment) " +
        "and adjust their store credit.\n\nStripe payment: " + pi + "\n\n" + (error instanceof Error ? error.message : String(error)),
    }).catch(() => {});
    return { handled: "refund_failed" as const };
  }
}
