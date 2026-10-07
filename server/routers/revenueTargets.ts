/**
 * Revenue targets for each staff member.
 *
 * Owner-only, for READING as well as writing. What a groomer is expected to
 * bring in — and whether they are short — is pay-adjacent, and showing one
 * groomer another's figures is the kind of thing that ends up in a staff
 * meeting. So both procedures go through canAdministerStaff, which is Lauren
 * and Andy by user id with email as a fallback.
 *
 * `protectedProcedure` would NOT be enough. It means "signed in and not a
 * restricted staff account", and six of the eight users here hold
 * users.role = "admin" — four of them groomers who were made admins to get
 * at the salon floor. adminProcedure has exactly the same problem. The
 * explicit list is the only thing that actually separates the owner from the
 * floor, which is why shared/staffAdministrators.ts exists.
 */
import { z } from "zod";
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { router, protectedProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { appointmentAddOns, appointments, staff } from "../../drizzle/schema";
import { canAdministerStaff, STAFF_ADMIN_DENIED_MESSAGE } from "@shared/staffAdministrators";
import {
  TARGET_PERIODS, type TargetPeriod,
  daysInRange, targetForDays, targetProgress,
} from "@shared/revenueTargets";

const REVENUE_TARGETS_DENIED =
  "Revenue targets are visible to the salon owner only.";

function requireOwner(user: { id: number; email?: string | null } | null | undefined) {
  if (!canAdministerStaff(user)) throw new Error(REVENUE_TARGETS_DENIED);
}

/** Brisbane midnight, as the UTC instant it actually happens at. */
function brisbaneMidnightUtc(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1, 14, 0, 0, 0));
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const revenueTargetsRouter = router({
  /**
   * Every staff member's target against what they have actually brought in.
   *
   * The window is given as Brisbane dates, inclusive at both ends, and the
   * stored target is scaled to however many days that is.
   */
  list: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().positive().default(1),
      from: dateString,
      to: dateString,
    }))
    .query(async ({ input, ctx }) => {
      requireOwner(ctx.user);
      const db = await getDb();
      if (!db) return { staff: [], days: 0 };
      const tenantId = tenantOf(ctx, input) ?? 1;

      const start = brisbaneMidnightUtc(input.from);
      // Exclusive end: the day AFTER the last day the salon counts.
      const endExclusive = new Date(brisbaneMidnightUtc(input.to).getTime() + 86_400_000);
      const days = daysInRange(new Date(`${input.from}T00:00:00Z`), new Date(`${input.to}T00:00:00Z`));

      const members = await db
        .select({
          id: staff.id,
          name: staff.name,
          role: staff.role,
          colourHex: staff.colourHex,
          isActive: staff.isActive,
          rostered: staff.rostered,
          revenueTarget: staff.revenueTarget,
          revenueTargetPeriod: staff.revenueTargetPeriod,
        })
        .from(staff)
        .where(and(eq(staff.tenantId, tenantId), eq(staff.isActive, true)));

      const ids = members.map((m) => m.id);
      const earned = ids.length === 0 ? [] : await db
        .select({
          staffId: appointments.staffId,
          // The groom itself. A membership groom is 0.00 on purpose — its
          // revenue arrives through the weekly membership payment, not the
          // appointment — so it contributes nothing here, same as every
          // other revenue figure in the app.
          price: sql<string>`COALESCE(SUM(${appointments.price}), 0)`,
        })
        .from(appointments)
        .where(and(
          eq(appointments.tenantId, tenantId),
          inArray(appointments.staffId, ids),
          eq(appointments.workflowState, "complete"),
          ne(appointments.status, "cancelled"),
          gte(appointments.scheduledStart, start),
          lt(appointments.scheduledStart, endExclusive),
        ))
        .groupBy(appointments.staffId);

      // Extras are revenue too, and they belong to whoever did the groom.
      const extras = ids.length === 0 ? [] : await db
        .select({
          staffId: appointments.staffId,
          total: sql<string>`COALESCE(SUM(${appointmentAddOns.unitPrice} * GREATEST(${appointmentAddOns.quantity}, 1)), 0)`,
        })
        .from(appointmentAddOns)
        .innerJoin(appointments, eq(appointments.id, appointmentAddOns.appointmentId))
        .where(and(
          eq(appointments.tenantId, tenantId),
          inArray(appointments.staffId, ids),
          eq(appointments.workflowState, "complete"),
          ne(appointments.status, "cancelled"),
          gte(appointments.scheduledStart, start),
          lt(appointments.scheduledStart, endExclusive),
        ))
        .groupBy(appointments.staffId);

      const priceBy = new Map(earned.map((r: any) => [Number(r.staffId), Number(r.price ?? 0)]));
      const extraBy = new Map(extras.map((r: any) => [Number(r.staffId), Number(r.total ?? 0)]));

      return {
        days,
        from: input.from,
        to: input.to,
        staff: members.map((member) => {
          const actual = (priceBy.get(member.id) ?? 0) + (extraBy.get(member.id) ?? 0);
          const target = targetForDays(
            member.revenueTarget,
            member.revenueTargetPeriod as TargetPeriod,
            days,
            start,
          );
          return {
            id: member.id,
            name: member.name,
            role: member.role,
            colourHex: member.colourHex,
            rostered: member.rostered,
            storedTarget: member.revenueTarget,
            storedPeriod: member.revenueTargetPeriod as TargetPeriod,
            ...targetProgress(actual, target),
          };
        }),
      };
    }),

  /** Set or clear one staff member's target. Null clears it. */
  set: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().positive().default(1),
      staffId: z.number().int().positive(),
      /** Dollars. Null removes the target rather than setting it to zero. */
      amount: z.number().nonnegative().max(1_000_000).nullable(),
      period: z.enum(TARGET_PERIODS),
    }))
    .mutation(async ({ input, ctx }) => {
      requireOwner(ctx.user);
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const tenantId = tenantOf(ctx, input) ?? 1;

      // Scoped to the salon, so a staff id from another tenant cannot be
      // written to by editing one number in the request.
      const [member] = await db
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.id, input.staffId), eq(staff.tenantId, tenantId)))
        .limit(1);
      if (!member) throw new Error("That staff member is not part of this salon");

      await db.update(staff)
        .set({
          revenueTarget: input.amount === null ? null : input.amount.toFixed(2),
          revenueTargetPeriod: input.period,
        })
        .where(eq(staff.id, input.staffId));

      return { success: true };
    }),
});

export { REVENUE_TARGETS_DENIED, STAFF_ADMIN_DENIED_MESSAGE };
