/**
 * Registering a device for notifications that arrive with Groomigo closed.
 *
 * `operationalProcedure`, not `protectedProcedure`. protectedProcedure
 * REJECTS restricted staff accounts in this codebase, and a groomer whose
 * phone cannot tell them the salon line is ringing is the main person
 * this feature is for.
 *
 * A subscription belongs to a device, not a person: one user legitimately
 * has three. Everything here is keyed on the endpoint so revoking a phone
 * never touches the salon screen.
 */
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, operationalProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { pushSubscriptions } from "../../drizzle/schema";
import {
  getVapidPublicKey, isPushConfigured, endpointHash, sendPushToUser, describeVapidProblem,
} from "../webPush";
import { canAdministerStaff } from "../../shared/staffAdministrators";

/**
 * The browser hands back an endpoint URL and two base64url keys. Lengths
 * are bounded because this is unauthenticated-ish input in the sense that
 * the browser composes it, and the columns are varchar(255).
 */
const subscriptionInput = z.object({
  tenantId: z.number().int().positive().default(1),
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(1).max(255),
  auth: z.string().min(1).max(255),
  userAgent: z.string().max(255).optional(),
});

export const pushSubscriptionsRouter = router({
  /**
   * The VAPID public key, so the browser can subscribe.
   *
   * Served at runtime rather than compiled in through a VITE_ variable:
   * rotating the keypair then needs no rebuild, and the private key has
   * no route into the client bundle.
   */
  publicKey: operationalProcedure.query(({ ctx }) => ({
    publicKey: getVapidPublicKey(),
    configured: isPushConfigured(),
    // Only an owner or admin can act on this, and it names environment
    // variables — a groomer seeing server configuration detail helps
    // nobody and tells them something they cannot use.
    problem: canAdministerStaff(ctx.user) ? describeVapidProblem() : null,
  })),

  subscribe: operationalProcedure
    .input(subscriptionInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const hash = endpointHash(input.endpoint);

      // Upsert on the endpoint hash. A browser re-subscribes the same
      // device on its own schedule — after a permission change, a key
      // rotation, or simply over time — and inserting a second row would
      // notify that phone twice for every call.
      await db.insert(pushSubscriptions).values({
        tenantId: input.tenantId,
        userId,
        endpoint: input.endpoint,
        endpointHash: hash,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      }).onDuplicateKeyUpdate({
        set: {
          // The keys genuinely rotate, so they must be overwritten and
          // not just left at their first value.
          userId,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent ?? null,
          // A re-subscribe is proof of life; clear the failure history so
          // an old run of errors does not follow a working device around.
          failureCount: 0,
          lastFailureAt: null,
        },
      });

      return { ok: true, configured: isPushConfigured() };
    }),

  unsubscribe: operationalProcedure
    .input(z.object({ endpoint: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Scoped to the caller: nobody unsubscribes somebody else's phone
      // by posting its endpoint.
      await db.delete(pushSubscriptions).where(and(
        eq(pushSubscriptions.endpointHash, endpointHash(input.endpoint)),
        eq(pushSubscriptions.userId, userId),
      ));
      return { ok: true };
    }),

  /**
   * The caller's own registered devices.
   *
   * Scoped to the caller deliberately — this is "is my phone actually
   * registered?", which is the first question when a notification does
   * not arrive, and not a directory of everyone's devices.
   */
  myDevices: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const userId = ctx.user?.id;
      if (!userId) return [];

      const rows = await db.select({
        id: pushSubscriptions.id,
        userAgent: pushSubscriptions.userAgent,
        createdAt: pushSubscriptions.createdAt,
        lastSuccessAt: pushSubscriptions.lastSuccessAt,
        lastFailureAt: pushSubscriptions.lastFailureAt,
        failureCount: pushSubscriptions.failureCount,
      }).from(pushSubscriptions).where(and(
        eq(pushSubscriptions.tenantId, input?.tenantId ?? 1),
        eq(pushSubscriptions.userId, userId),
      )).orderBy(desc(pushSubscriptions.createdAt));

      return rows;
    }),

  /**
   * Fire a real push at the caller's own devices.
   *
   * Goes the whole way through the push service rather than faking it in
   * the page, because the thing being tested is precisely the part that
   * works when the page is gone. The result says how many devices it
   * reached, so "nothing arrived" can be told apart from "nothing was
   * sent".
   */
  sendTest: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      return await sendPushToUser(input?.tenantId ?? 1, userId, {
        title: "Groomigo test notification",
        body: "This is what an incoming call or a new message will look like.",
        url: "/settings",
        tag: "gsos-test",
        kind: "new-message",
        renotify: true,
        requireInteraction: false,
      });
    }),
});
