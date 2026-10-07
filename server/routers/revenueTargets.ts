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
import { and, eq, gt, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { router, protectedProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { appointmentAddOns, appointments, pets, staff } from "../../drizzle/schema";
import { canAdministerStaff, STAFF_ADMIN_DENIED_MESSAGE } from "@shared/staffAdministrators";
import {
  TARGET_PERIODS, type TargetPeriod,
  daysInRange, targetForDays, targetProgress, rangeForPeriod, brisbaneToday,
} from "@shared/revenueTargets";
import { SIZE_BAND_IDS, type DogSizeBand } from "@shared/dogSizeBand";
import {
  SIZE_HOURS, weightTargetForMix, describeDifficulty, type BandStat,
} from "@shared/sizeWeightedTargets";

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
      /**
       * An explicit window. Leave both out and every staff member is
       * measured over THEIR OWN target period to date instead — a monthly
       * target runs from the first of the month, a quarterly one from the
       * start of the quarter, and neither goes back to zero until that
       * period actually ends.
       *
       * The staff profile panel passes a window because it shows revenue
       * beside timing analytics for the same days. The targets card does
       * not, because "has Megs hit her week?" is a question about Megs's
       * week, not about whichever button was last pressed.
       */
      from: dateString.optional(),
      to: dateString.optional(),
    }))
    .query(async ({ input, ctx }) => {
      requireOwner(ctx.user);
      const db = await getDb();
      if (!db) return { staff: [], days: 0 };
      const tenantId = tenantOf(ctx, input) ?? 1;

      const today = brisbaneToday();
      const explicit = input.from && input.to ? { from: input.from, to: input.to } : null;

      /** The window one staff member is measured over. */
      const windowFor = (period: TargetPeriod) =>
        explicit ?? rangeForPeriod(period, today);

      // Widest window anyone could need, so one pair of queries covers
      // everybody however their own periods differ.
      const widest = explicit ?? rangeForPeriod("quarterly", today);
      const start = brisbaneMidnightUtc(widest.from);
      // Exclusive end: the day AFTER the last day the salon counts.
      const endExclusive = new Date(brisbaneMidnightUtc(widest.to).getTime() + 86_400_000);

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

      // Rows, not totals. Each staff member is measured over their own
      // period, so the grouping cannot happen in SQL — it happens below,
      // once each person's window is known.
      const groomRows = ids.length === 0 ? [] : await db
        .select({
          staffId: appointments.staffId,
          at: appointments.scheduledStart,
          price: appointments.price,
          sizeBand: pets.sizeBand,
        })
        .from(appointments)
        .leftJoin(pets, eq(pets.id, appointments.petId))
        .where(and(
          eq(appointments.tenantId, tenantId),
          inArray(appointments.staffId, ids),
          eq(appointments.workflowState, "complete"),
          ne(appointments.status, "cancelled"),
          gte(appointments.scheduledStart, start),
          lt(appointments.scheduledStart, endExclusive),
        ));

      const extraRows = ids.length === 0 ? [] : await db
        .select({
          staffId: appointments.staffId,
          at: appointments.scheduledStart,
          unitPrice: appointmentAddOns.unitPrice,
          quantity: appointmentAddOns.quantity,
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
        ));

      // What each size of dog actually earns the salon, over a trailing
      // year. Computed rather than hardcoded: the day the salon reprices, a
      // constant in a file becomes a lie, and this is the number the whole
      // adjustment rests on.
      const twelveMonthsAgo = new Date(Date.now() - 365 * 86_400_000);
      const bandStatRows = await db
        .select({
          band: pets.sizeBand,
          n: sql<number>`COUNT(*)`,
          avgPrice: sql<string>`AVG(${appointments.price})`,
        })
        .from(appointments)
        .innerJoin(pets, eq(pets.id, appointments.petId))
        .where(and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.workflowState, "complete"),
          ne(appointments.status, "cancelled"),
          isNotNull(pets.sizeBand),
          gt(appointments.price, "0"),
          gte(appointments.scheduledStart, twelveMonthsAgo),
        ))
        .groupBy(pets.sizeBand);
      const bandStats: Partial<Record<DogSizeBand, BandStat>> = {};
      let salonRevenue = 0;
      let salonHours = 0;
      for (const row of bandStatRows as any[]) {
        const band = row.band as DogSizeBand;
        const count = Number(row.n ?? 0);
        const averagePrice = Number(row.avgPrice ?? 0);
        if (!band || count <= 0 || !Number.isFinite(averagePrice)) continue;
        bandStats[band] = { count, averagePrice };
        salonRevenue += averagePrice * count;
        salonHours += (SIZE_HOURS[band] ?? 1) * count;
      }
      const salonRate = salonHours > 0 ? salonRevenue / salonHours : null;

      /** Brisbane calendar date of an appointment, as YYYY-MM-DD. */
      const dateKey = (at: Date | string) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(at));

      const groomsByStaff = new Map<number, Array<{ day: string; price: number; band: string | null }>>();
      for (const row of groomRows as any[]) {
        const key = Number(row.staffId);
        if (!groomsByStaff.has(key)) groomsByStaff.set(key, []);
        groomsByStaff.get(key)!.push({
          day: dateKey(row.at),
          price: Number(row.price ?? 0),
          band: row.sizeBand ?? null,
        });
      }
      const extrasByStaff = new Map<number, Array<{ day: string; amount: number }>>();
      for (const row of extraRows as any[]) {
        const key = Number(row.staffId);
        if (!extrasByStaff.has(key)) extrasByStaff.set(key, []);
        extrasByStaff.get(key)!.push({
          day: dateKey(row.at),
          amount: Number(row.unitPrice ?? 0) * Math.max(1, Number(row.quantity ?? 1)),
        });
      }

      return {
        // The window the CARD was asked for, when it asked for one. With no
        // explicit window each row carries its own — see `window` below.
        from: explicit?.from ?? null,
        to: explicit?.to ?? null,
        followsEachTarget: explicit === null,
        staff: members.map((member) => {
          const period = member.revenueTargetPeriod as TargetPeriod;
          // The heart of this: a monthly target is measured from the first
          // of the month and a quarterly one from the start of the quarter.
          // Neither goes back to zero until that period actually ends.
          const win = windowFor(period);
          const days = daysInRange(
            new Date(`${win.from}T00:00:00Z`),
            new Date(`${win.to}T00:00:00Z`),
          );
          const inWindow = (day: string) => day >= win.from && day <= win.to;

          const grooms = (groomsByStaff.get(member.id) ?? []).filter((g) => inWindow(g.day));
          const extrasIn = (extrasByStaff.get(member.id) ?? []).filter((e) => inWindow(e.day));
          const actual =
            grooms.reduce((sum, g) => sum + g.price, 0) +
            extrasIn.reduce((sum, e) => sum + e.amount, 0);

          const bands: Record<string, number> = {};
          let unknown = 0;
          for (const g of grooms) {
            // A dog with no band is counted separately, never folded into
            // the smallest — calling an unsized dog small would flatter
            // whoever grooms them.
            if (g.band && (SIZE_BAND_IDS as readonly string[]).includes(g.band)) {
              bands[g.band] = (bands[g.band] ?? 0) + 1;
            } else {
              unknown += 1;
            }
          }

          const target = targetForDays(
            member.revenueTarget,
            period,
            days,
            brisbaneMidnightUtc(win.from),
          );
          const weighted = weightTargetForMix(target, bands as any, bandStats, salonRate);
          return {
            id: member.id,
            name: member.name,
            role: member.role,
            colourHex: member.colourHex,
            rostered: member.rostered,
            storedTarget: member.revenueTarget,
            storedPeriod: period,
            /** The days this row is measured over, and how far through. */
            window: { from: win.from, to: win.to, days },
            dogs: grooms.length,
            sizeMix: bands as Partial<Record<DogSizeBand, number>>,
            unbandedDogs: unknown,
            weightedTarget: weighted,
            difficultyNote: describeDifficulty(weighted),
            ...targetProgress(actual, weighted ? weighted.adjusted : target),
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
