/**
 * Cards on file and membership subscriptions, as endpoints.
 *
 * `adminProcedure` throughout: this is the money surface. Sending a card
 * link, starting a weekly subscription and charging a card are owner
 * decisions, not salon-floor ones, and `protectedProcedure` would still be
 * too wide because it admits any non-staff account.
 *
 * Note what is deliberately NOT here: nothing takes a card number. The only
 * way a card enters the system is the client typing it into Stripe's own
 * page, which is what keeps the business out of PCI scope.
 */
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { clients, memberships, membershipPayments } from "../../drizzle/schema";
import {
  createCardSetupLink,
  emailCardSetupLink,
  detachClientCard,
  startMembershipSubscription,
  cancelMembershipSubscription,
  chargeSavedCard,
  payOpenInvoice,
} from "../stripeCards";
import {
  canChargeOffSession,
  describeCard,
  isCardExpired,
  describeStripeKey,
  classifyFailure,
  planAfterFailure,
} from "@shared/stripeBilling";

const cardColumns = {
  id: clients.id,
  firstName: clients.firstName,
  lastName: clients.lastName,
  email: clients.email,
  stripeCustomerId: clients.stripeCustomerId,
  stripeDefaultPaymentMethodId: clients.stripeDefaultPaymentMethodId,
  stripeCardBrand: clients.stripeCardBrand,
  stripeCardLast4: clients.stripeCardLast4,
  stripeCardExpMonth: clients.stripeCardExpMonth,
  stripeCardExpYear: clients.stripeCardExpYear,
  stripeCardSavedAt: clients.stripeCardSavedAt,
};

export const stripeCardsRouter = router({
  /** Whether this deployment can charge anything at all, and in which mode. */
  configuration: adminProcedure.query(() => {
    const key = describeStripeKey(process.env.STRIPE_SECRET_KEY);
    return {
      ...key,
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET && !/placeholder/i.test(process.env.STRIPE_WEBHOOK_SECRET)),
    };
  }),

  cardStatus: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [client] = await db.select(cardColumns).from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client) throw new Error("Client not found");
      const expired = isCardExpired(client, new Date());
      return {
        clientId: client.id,
        description: describeCard(client),
        chargeable: canChargeOffSession(client) && !expired,
        expired,
        savedAt: client.stripeCardSavedAt,
      };
    }),

  /**
   * A link for the client to save a card. Returned rather than sent: texting
   * or emailing a real client is a separate, deliberate act, and the salon
   * chooses the channel.
   */
  createSetupLink: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ input }) => createCardSetupLink(input.clientId)),

  /** Create the link AND email it to the client's address on file. */
  emailSetupLink: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ input }) => emailCardSetupLink(input.clientId)),

  removeCard: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ input }) => detachClientCard(input.clientId)),

  startSubscription: adminProcedure
    // The cadence comes from the membership itself, not the caller: a
    // stale tab must not be able to bill at a cadence of its choosing.
    .input(z.object({ membershipId: z.number() }))
    .mutation(async ({ input }) => startMembershipSubscription(input.membershipId)),

  cancelSubscription: adminProcedure
    .input(z.object({ membershipId: z.number() }))
    .mutation(async ({ input }) => cancelMembershipSubscription(input.membershipId)),

  /**
   * Charge a membership now, from the counter, instead of waiting for the
   * scheduled retry. Same decision path as the nightly job, so a decline
   * here schedules and escalates exactly as one there would.
   */
  chargeNow: adminProcedure
    .input(z.object({ membershipId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [membership] = await db
        .select({
          id: memberships.id,
          tenantId: memberships.tenantId,
          clientId: memberships.clientId,
          name: memberships.name,
          pricePerCycle: memberships.pricePerCycle,
          failedPaymentCount: memberships.failedPaymentCount,
        })
        .from(memberships)
        .where(eq(memberships.id, input.membershipId))
        .limit(1);
      if (!membership?.clientId || (membership.tenantId ?? 1) !== 1) throw new Error("Membership not found");

      const [client] = await db.select(cardColumns).from(clients).where(eq(clients.id, membership.clientId)).limit(1);
      const now = new Date();
      if (!client || !canChargeOffSession(client)) {
        throw new Error("No card on file for this client. Send them a card link first.");
      }
      if (isCardExpired(client, now)) {
        throw new Error(`${describeCard(client) ?? "The card"} has expired. Ask the client for new details.`);
      }

      const [lastFailure] = await db
        .select({ stripeInvoiceId: membershipPayments.stripeInvoiceId })
        .from(membershipPayments)
        .where(and(eq(membershipPayments.membershipId, membership.id), eq(membershipPayments.status, "failed")))
        .orderBy(desc(membershipPayments.id))
        .limit(1);

      const result = lastFailure?.stripeInvoiceId
        ? await payOpenInvoice(lastFailure.stripeInvoiceId)
        : await chargeSavedCard({
            customerId: client.stripeCustomerId!,
            paymentMethodId: client.stripeDefaultPaymentMethodId!,
            amountDollars: membership.pricePerCycle ?? "0",
            description: `${membership.name ?? "Membership"} - charged from Groomigo`,
            metadata: {
              groomigo_membership_id: String(membership.id),
              membership_id: String(membership.id),
              groomigo_client_id: String(membership.clientId),
              tenant_id: String(membership.tenantId ?? 1),
              payment_kind: "membership_manual",
            },
          });

      if (result.ok) {
        await db.update(memberships).set({
          failedPaymentCount: 0,
          lastFailedPaymentAt: null,
          paymentRetryScheduledAt: null,
          bookingSuspended: false,
          status: "active",
        }).where(eq(memberships.id, membership.id));
        // The payment row comes from the invoice.paid webhook when Stripe
        // settled an invoice; only a direct charge is booked here.
        if (!lastFailure?.stripeInvoiceId) {
          await db.insert(membershipPayments).values({
            membershipId: membership.id,
            amount: membership.pricePerCycle ?? "0",
            status: "paid",
            stripePaymentIntentId: result.paymentIntentId,
            paidAt: now,
          });
        }
        return { ok: true, message: "Payment taken" };
      }

      const plan = planAfterFailure((membership.failedPaymentCount ?? 0) + 1, classifyFailure(result.declineCode), now);
      await db.update(memberships).set({
        failedPaymentCount: (membership.failedPaymentCount ?? 0) + 1,
        lastFailedPaymentAt: now,
        paymentRetryScheduledAt: plan.retryAt,
        bookingSuspended: plan.suspend,
        status: plan.suspend ? "paused" : "pending_payment",
      }).where(eq(memberships.id, membership.id));
      await db.insert(membershipPayments).values({
        membershipId: membership.id,
        amount: membership.pricePerCycle ?? "0",
        status: "failed",
        failureReason: result.message ?? plan.reason,
      });
      return { ok: false, message: result.message ?? plan.reason, nextAction: plan.reason };
    }),
});
