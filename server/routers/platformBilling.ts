/**
 * A salon's own subscription to Groomigo.
 *
 * The rules are in shared/platformBilling.ts and the Stripe calls in
 * server/platformBilling.ts, which explains at length why every call here
 * is on the PLATFORM account and never the salon's connected one.
 *
 * ## Procedure types
 *
 * `status` is protectedProcedure, which rejects restricted `staff`
 * accounts (CLAUDE.md §5). A groomer has no business reading what their
 * employer pays, and it appears on the Settings page they cannot open
 * anyway.
 *
 * `startCheckout` and `managePortal` are adminProcedure. Both lead
 * somewhere that moves real money out of the salon's bank account.
 *
 * Every one of them bills the CALLER'S OWN salon — tenantOf(ctx) returns
 * the caller's tenant and ignores anything the request names, so there is
 * no input by which one salon could start, change or cancel another's
 * subscription.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import {
  createPlatformBillingPortal, createPlatformSubscriptionCheckout, priceIdForPlan,
} from "../platformBilling";
import {
  describeSalonSubscription, salonHasAccess,
  type SalonSubscriptionStatus,
} from "@shared/platformBilling";

const PLAN = z.enum(["starter", "professional", "enterprise"]);

export const platformBillingRouter = router({
  /** What this salon is paying, and whether anything needs doing. */
  status: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, null);

      const [row] = await db.select({
        plan: tenants.subscriptionPlan,
        status: tenants.subscriptionStatus,
        trialEndsAt: tenants.trialEndsAt,
        currentPeriodEnd: tenants.subscriptionCurrentPeriodEnd,
        customerId: tenants.platformStripeCustomerId,
        subscriptionId: tenants.platformStripeSubscriptionId,
      }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That salon does not exist" });

      const status = row.status as SalonSubscriptionStatus;
      return {
        plan: row.plan,
        status,
        description: describeSalonSubscription({
          status,
          currentPeriodEnd: row.currentPeriodEnd,
          trialEndsAt: row.trialEndsAt,
        }),
        hasAccess: salonHasAccess({ status, currentPeriodEnd: row.currentPeriodEnd }),
        /** Whether there is anything for the Stripe portal to manage. */
        billingSetUp: Boolean(row.customerId),
        subscribed: Boolean(row.subscriptionId),
        currentPeriodEnd: row.currentPeriodEnd,
        trialEndsAt: row.trialEndsAt,
        /*
         * Which plans can actually be bought right now. A plan with no
         * Stripe price configured would send somebody to a checkout that
         * fails, so it is not offered — and the Settings page can say
         * why rather than showing a dead button.
         */
        purchasablePlans: (["starter", "professional", "enterprise"] as const)
          .filter((plan) => priceIdForPlan(plan) !== null),
      };
    }),

  /** Start paying. Returns a Stripe Checkout URL; no card touches this app. */
  startCheckout: adminProcedure
    .input(z.object({ plan: PLAN }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = tenantOf(ctx, null);
      try {
        return await createPlatformSubscriptionCheckout({ tenantId, plan: input.plan });
      } catch (error) {
        // Stripe's own messages are usable here — "No such price", "This
        // salon already has a subscription" — and hiding them behind a
        // generic failure would leave somebody guessing at their own
        // billing.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Could not start checkout",
        });
      }
    }),

  /**
   * Stripe's own page for cards, invoices and cancelling.
   *
   * Everything a salon needs to do to its billing happens there, hosted
   * by Stripe, so no card number ever reaches this app.
   */
  managePortal: adminProcedure
    .mutation(async ({ ctx }) => {
      const tenantId = tenantOf(ctx, null);
      try {
        return await createPlatformBillingPortal(tenantId);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Could not open billing",
        });
      }
    }),
});
