/**
 * The numbers on the sidebar: what is waiting for someone.
 *
 * Counts only, no rows. This is polled on every screen by every signed-in
 * staff member, so it has to stay cheap — the existing getUnreadPreview
 * loads the recent messages as well, which is right for a dropdown and
 * wasteful for a badge.
 *
 * `operationalProcedure`, not `protectedProcedure`. getUnreadPreview is
 * protected, which in this codebase means it REJECTS restricted staff
 * accounts — so a groomer would have seen no badge at all. Knowing a client
 * is waiting on a reply is salon-floor information.
 *
 * Nothing here leaks content. A groomer learns that three messages are
 * unread, not what they say or who sent them; the pages behind the badges do
 * their own access checks.
 */
import { z } from "zod";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { router, operationalProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { missedCalls, portalMessages, portalThreads, smsLogs } from "../../drizzle/schema";
import { getSmsUsage } from "../smsUsage";

export type SidebarCounts = {
  /** Unread inbound SMS plus unheard voicemails — both live on Messages. */
  messages: number;
  /** Client portal messages nobody at the salon has read yet. */
  portalMessages: number;
};

export const smsUsageRouter = router({
  /**
   * This month's outbound texts against the salon's allowance.
   *
   * operationalProcedure: a groomer about to send a pickup text should be
   * able to see the salon is near its cap. It exposes counts, not content.
   */
  get: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .query(async ({ input }) => getSmsUsage(input?.tenantId ?? 1)),
});

export const sidebarCountsRouter = router({
  get: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .query(async ({ input, ctx }): Promise<SidebarCounts> => {
      const db = await getDb();
      if (!db) return { messages: 0, portalMessages: 0 };
      const tenantId = tenantOf(ctx, input) ?? 1;

      const [[sms], [calls], [portal]] = await Promise.all([
        db.select({ n: sql<number>`COUNT(*)` }).from(smsLogs).where(and(
          eq(smsLogs.tenantId, tenantId),
          eq(smsLogs.direction, "inbound"),
          isNull(smsLogs.readAt),
        )),
        db.select({ n: sql<number>`COUNT(*)` }).from(missedCalls).where(and(
          eq(missedCalls.tenantId, tenantId),
          isNull(missedCalls.readAt),
        )),
        // A client message counts as unread until a staff member has opened
        // the thread since it arrived. Derived from the messages rather than
        // a stored counter, so it cannot drift away from them.
        db.select({ n: sql<number>`COUNT(*)` })
          .from(portalMessages)
          .innerJoin(portalThreads, eq(portalMessages.threadId, portalThreads.id))
          .where(and(
            eq(portalMessages.tenantId, tenantId),
            eq(portalMessages.sender, "client"),
            or(
              isNull(portalThreads.staffLastReadAt),
              sql`${portalMessages.createdAt} > ${portalThreads.staffLastReadAt}`,
            ),
          )),
      ]);

      return {
        messages: Number(sms?.n ?? 0) + Number(calls?.n ?? 0),
        portalMessages: Number(portal?.n ?? 0),
      };
    }),
});
