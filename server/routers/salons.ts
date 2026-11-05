/**
 * The salons a person can act in, and who may grant that.
 *
 * Lauren owns Barkin' Beautiful and, from 23/11/2026, The Pet Pad. Separate
 * books — own clients, pets, staff, calendar, pricing and subscription — so
 * she needs two salons and a switcher rather than the shared-site model,
 * which would mean one client record spanning both.
 *
 * ## Procedure types
 *
 * `mine` is operational. Every signed-in person asks it on page load,
 * restricted staff included, and a groomer who cannot read their own salon
 * list cannot render the header at all. It returns only salons the caller
 * already has access to, so there is nothing in it they could not see.
 *
 * `grant` and `revoke` are admin. A row here is what lets somebody read
 * another business's clients, pets and takings — it is the most
 * consequential write in this file and the only one that needs an audit
 * trail of who did it.
 */
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, operationalProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { salonAccess, tenants, users } from "../../drizzle/schema";
import { canAccessSalon, shouldOfferSalonSwitcher } from "@shared/salonAccess";

export const salonsRouter = router({
  /**
   * The salons in the switcher, and which one this request is in.
   *
   * `showSwitcher` is decided here rather than by the page counting the
   * list, because almost every account has exactly one salon and must not
   * grow a dropdown that does nothing — it reads as a setting somebody
   * failed to finish.
   */
  mine: operationalProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const ids = ctx.accessibleTenantIds;
      if (ids.length === 0) return { salons: [], activeTenantId: ctx.tenantId, showSwitcher: false };

      const rows = await db.select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        subscriptionStatus: tenants.subscriptionStatus,
      }).from(tenants).where(inArray(tenants.id, ids));

      return {
        // Ordered by name so the switcher does not reshuffle itself when a
        // salon is added.
        salons: rows.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)),
        activeTenantId: ctx.tenantId,
        showSwitcher: shouldOfferSalonSwitcher(ids),
      };
    }),

  /**
   * Let somebody into another salon.
   *
   * Deliberately takes a user id and a tenant id rather than an email and a
   * name: this is not an invitation flow, it is an owner being given a
   * second business they already own. The invitation path for new staff is
   * staff.invite and is unchanged.
   */
  grant: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), tenantId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [salon] = await db.select({ id: tenants.id, name: tenants.name })
        .from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
      if (!salon) throw new TRPCError({ code: "NOT_FOUND", message: "That salon does not exist" });
      const [user] = await db.select({ id: users.id }).from(users)
        .where(eq(users.id, input.userId)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "That user does not exist" });

      // Unique on (user, tenant), so a second grant is a no-op rather than
      // a duplicate row that makes the access list lie about its length.
      const existing = await db.select({ id: salonAccess.id }).from(salonAccess)
        .where(and(eq(salonAccess.userId, input.userId), eq(salonAccess.tenantId, input.tenantId)))
        .limit(1);
      if (existing.length > 0) return { success: true, alreadyHad: true, salonName: salon.name };

      await db.insert(salonAccess).values({
        userId: input.userId,
        tenantId: input.tenantId,
        grantedByUserId: ctx.user.id,
      });
      return { success: true, alreadyHad: false, salonName: salon.name };
    }),

  /**
   * Take it away again.
   *
   * Only removes the explicit grant. It cannot take somebody out of the
   * salon their own user or staff record names — that is where they
   * belong, and removing it here would lock them out of their own business
   * while leaving the rows that say they work there.
   */
  revoke: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), tenantId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [user] = await db.select({ id: users.id, tenantId: users.tenantId }).from(users)
        .where(eq(users.id, input.userId)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "That user does not exist" });
      if (user.tenantId === input.tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That is this user's home salon — change their own record instead",
        });
      }

      await db.delete(salonAccess).where(and(
        eq(salonAccess.userId, input.userId),
        eq(salonAccess.tenantId, input.tenantId),
      ));
      return { success: true };
    }),

  /**
   * Confirm a salon is one the caller may act in.
   *
   * The switcher calls this before it stores a choice, so a stale tab
   * holding a salon whose access was removed finds out immediately rather
   * than silently falling back and showing the wrong books.
   */
  canAccess: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => ({
      allowed: canAccessSalon(ctx.accessibleTenantIds, input.tenantId),
    })),
});
