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
import { groomsFreeDuringPause } from "@shared/membershipCoverageDrift";
import { resolvePauseResumesAt } from "@shared/membershipPause";
import { and, desc, eq, gte, isNull, inArray } from "drizzle-orm";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { appointments, clients, memberships, membershipPayments, pets } from "../../drizzle/schema";
import {
  createCardSetupLink,
  emailCardSetupLink,
  detachClientCard,
  startMembershipSubscription,
  cancelMembershipSubscription,
  pauseMembershipSubscription,
  resumeMembershipSubscription,
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
    .input(z.object({
      membershipId: z.number(),
      /** yyyy-mm-dd, Brisbane. Omitted charges now. */
      firstChargeOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }))
    .mutation(async ({ input }) => startMembershipSubscription(input.membershipId, input.firstChargeOn)),

  cancelSubscription: adminProcedure
    .input(z.object({ membershipId: z.number() }))
    .mutation(async ({ input }) => cancelMembershipSubscription(input.membershipId)),

  /**
   * Stop charging without tearing the subscription down, with the
   * restart decided now rather than left to somebody's memory.
   *
   * The three modes are a discriminated union so an impossible request
   * cannot be expressed: a cycles pause carries no date, a date pause
   * carries no cycle count, and a manual one carries neither.
   */
  pauseSubscription: adminProcedure
    .input(z.object({
      membershipId: z.number(),
      plan: z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("cycles"), cycles: z.number().int().min(1).max(52) }),
        z.object({ mode: z.literal("date"), resumeOn: z.coerce.date() }),
        z.object({ mode: z.literal("manual") }),
      ]).default({ mode: "manual" }),
    }))
    .mutation(async ({ input }) => pauseMembershipSubscription(input.membershipId, input.plan)),

  /**
   * What pausing would do to grooms already in the diary.
   *
   * Coverage is frozen onto an appointment when it is booked, so a
   * groom booked before a pause and falling inside it is still marked
   * covered — the dog is done for nothing while the fee is skipped.
   * Nothing warned anybody, and one full-price groom outweighs several
   * weeks of the fee being saved.
   *
   * A query, not a mutation: it tells staff what they are about to do
   * so they can move or cancel those grooms first. It changes nothing
   * and reprices nothing, because repricing a booking a client has
   * already been quoted is not a decision software should take alone.
   */
  pauseImpact: adminProcedure
    .input(z.object({
      membershipId: z.number(),
      plan: z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("cycles"), cycles: z.number().int().min(1).max(52) }),
        z.object({ mode: z.literal("date"), resumeOn: z.coerce.date() }),
        z.object({ mode: z.literal("manual") }),
      ]).default({ mode: "manual" }),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { freeGrooms: [], until: null, openEnded: false };

      const [membership] = await db
        .select({
          id: memberships.id,
          petId: memberships.petId,
          billingCycle: memberships.billingCycle,
          billingCycleWeeks: memberships.billingCycleWeeks,
          nextBillingDate: memberships.nextBillingDate,
        })
        .from(memberships)
        .where(eq(memberships.id, input.membershipId))
        .limit(1);
      if (!membership) return { freeGrooms: [], until: null, openEnded: false };

      const now = new Date();
      const resumesAt = resolvePauseResumesAt(input.plan, {
        nextBillingDate: membership.nextBillingDate ?? null,
        billingCycle: (membership.billingCycle ?? "weekly") as "weekly" | "monthly",
        billingCycleWeeks: membership.billingCycleWeeks ?? 1,
        now,
      });

      /**
       * A manual pause has no end, so it gets a horizon instead.
       *
       * Eight weeks: long enough to cover the salon's longest grooming
       * interval, short enough that the list stays something a person
       * can read. Returning every booking the client will ever have is
       * not a list anybody acts on.
       */
      const openEnded = resumesAt === null;
      const until = resumesAt ?? new Date(now.getTime() + 8 * 7 * 24 * 60 * 60 * 1000);

      const rows = await db
        .select({
          id: appointments.id,
          petId: appointments.petId,
          petName: pets.name,
          scheduledStart: appointments.scheduledStart,
          price: appointments.price,
          membershipId: appointments.membershipId,
          workflowState: appointments.workflowState,
          status: appointments.status,
        })
        .from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .where(and(
          eq(appointments.membershipId, membership.id),
          gte(appointments.scheduledStart, now),
        ));

      return {
        freeGrooms: groomsFreeDuringPause(rows, { membershipId: membership.id, from: now, until }),
        until: resumesAt,
        openEnded,
      };
    }),

  /** Start charging a paused membership again. */
  resumeSubscription: adminProcedure
    .input(z.object({ membershipId: z.number() }))
    .mutation(async ({ input }) => resumeMembershipSubscription(input.membershipId)),

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
          billingCycle: memberships.billingCycle,
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

      const plan = planAfterFailure(
        (membership.failedPaymentCount ?? 0) + 1,
        classifyFailure(result.declineCode),
        now,
        membership.billingCycle ?? "weekly",
      );
      await db.update(memberships).set({
        failedPaymentCount: (membership.failedPaymentCount ?? 0) + 1,
        lastFailedPaymentAt: now,
        paymentRetryScheduledAt: plan.retryAt,
        bookingSuspended: plan.suspend,
        status: plan.suspend ? "paused" : "pending_payment",
        // A payment failure is not a holiday. Clearing the pause
        // schedule keeps the two meanings of status "paused" from
        // blurring, and stops a stale restart date from ever being
        // read as one.
        pauseMode: null,
        pauseResumesAt: null,
        pausedAt: null,
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
