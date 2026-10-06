/**
 * Connecting a salon's own Stripe account.
 *
 * `adminProcedure` throughout: this decides where a business's money
 * lands, and is not something a groomer should be able to start, finish
 * or redirect.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import {
  getConnectStatus, createOnboardingLink, createDashboardLink, refreshFromStripe,
} from "../stripeConnectAccounts";
import { describeConnectState, describeFeeBps, MAX_PLATFORM_FEE_BPS } from "../../shared/stripeConnect";

/** Stripe failures are the salon's problem to act on, so say what happened. */
function stripeError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Stripe did not respond";
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export const stripeConnectRouter = router({
  status: adminProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .query(async ({ ctx, input }) => {
      const status = await getConnectStatus(tenantOf(ctx, input));
      return {
        ...status,
        description: describeConnectState(status.state),
        feeLabel: describeFeeBps(status.platformFeeBps),
      };
    }),

  /** A fresh one-time link into Stripe's hosted onboarding. */
  startOnboarding: adminProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .mutation(async ({ ctx, input }) => {
      try {
        return { url: await createOnboardingLink(tenantOf(ctx, input)) };
      } catch (error) { stripeError(error); }
    }),

  /** Into the salon's own Express dashboard, to see their payouts. */
  dashboardLink: adminProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .mutation(async ({ ctx, input }) => {
      try {
        return { url: await createDashboardLink(tenantOf(ctx, input)) };
      } catch (error) { stripeError(error); }
    }),

  /** Ask Stripe directly, rather than trusting the cached answer. */
  refresh: adminProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .mutation(async ({ ctx, input }) => {
      try {
        const status = await refreshFromStripe(tenantOf(ctx, input));
        return { ...status, description: describeConnectState(status.state) };
      } catch (error) { stripeError(error); }
    }),

  /**
   * Groomigo's cut, in basis points. Null clears it back to undecided.
   *
   * Capped, because this is a number somebody types and a slipped digit
   * is the difference between 2.5% and 25%.
   */
  setPlatformFee: adminProcedure
    .input(z.object({
      tenantId: z.number().int().positive().default(1),
      feeBps: z.number().int().min(0).max(MAX_PLATFORM_FEE_BPS).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
      await db.update(tenants).set({ platformFeeBps: input.feeBps })
        .where(eq(tenants.id, tenantOf(ctx, input)));
      return { success: true, feeLabel: describeFeeBps(input.feeBps) };
    }),
});
