/**
 * Add-ons done on an appointment.
 *
 * `operationalProcedure` throughout: the person who shaves a matted coat
 * or empties a dog's glands is the groomer, and they are exactly who
 * should be recording it. `protectedProcedure` would reject restricted
 * staff accounts and leave the salon floor unable to log the work they
 * just did.
 *
 * Prices are copied from the catalogue at the moment the add-on is
 * recorded, never joined. See the 0082 migration: a catalogue price is a
 * price list and it moves; an invoice is what was charged on the day.
 */
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, operationalProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { appointmentAddOns, pricingServices } from "../../drizzle/schema";
import { requireApprovedStaffAppointmentAccess } from "../staffAccess";
import { addOnRequiresManualPrice, addOnsTotal } from "../../shared/appointmentAddOns";

export const appointmentAddOnsRouter = router({
  /** The add-ons the salon offers, for the picker. */
  catalogue: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: pricingServices.id,
        name: pricingServices.name,
        code: pricingServices.code,
        priceMode: pricingServices.priceMode,
        priceAud: pricingServices.priceAud,
        priceMaxAud: pricingServices.priceMaxAud,
        description: pricingServices.description,
      }).from(pricingServices).where(and(
        eq(pricingServices.tenantId, input?.tenantId ?? 1),
        eq(pricingServices.catalogueType, "add_on"),
        eq(pricingServices.isActive, true),
      )).orderBy(asc(pricingServices.sortOrder), asc(pricingServices.name));
    }),

  /** What has been added to this appointment, and what it comes to. */
  list: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1), appointmentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { addOns: [], total: "0.00" };
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const addOns = await db.select().from(appointmentAddOns).where(and(
        eq(appointmentAddOns.tenantId, input.tenantId),
        eq(appointmentAddOns.appointmentId, input.appointmentId),
      )).orderBy(asc(appointmentAddOns.id));

      return { addOns, total: addOnsTotal(addOns) };
    }),

  add: operationalProcedure
    .input(z.object({
      tenantId: z.number().int().positive().default(1),
      appointmentId: z.number(),
      pricingServiceId: z.number(),
      quantity: z.number().int().min(1).max(20).default(1),
      /** Required for a quoted add-on, which has no list price to copy. */
      unitPrice: z.number().min(0).max(10000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const [service] = await db.select().from(pricingServices).where(and(
        eq(pricingServices.id, input.pricingServiceId),
        eq(pricingServices.tenantId, input.tenantId),
        eq(pricingServices.catalogueType, "add_on"),
      )).limit(1);
      if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "That add-on is not in the catalogue" });

      // A quoted add-on carries no list price. Recording one at $0
      // because nobody typed a figure is work given away, so it is
      // refused rather than guessed.
      const needsPrice = addOnRequiresManualPrice(service.priceMode);
      if (needsPrice && input.unitPrice === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${service.name} is priced per dog — enter the agreed amount`,
        });
      }

      const unitPrice = input.unitPrice !== undefined
        ? input.unitPrice.toFixed(2)
        : (service.priceAud ?? "0.00");

      await db.insert(appointmentAddOns).values({
        tenantId: input.tenantId,
        appointmentId: input.appointmentId,
        pricingServiceId: service.id,
        // Snapshots, so a rename or a price rise never changes a past bill.
        name: service.name,
        unitPrice,
        quantity: input.quantity,
        createdByUserId: ctx.user?.id ?? null,
      });

      return { success: true, name: service.name, unitPrice };
    }),

  /** Change what was charged, or how many. */
  update: operationalProcedure
    .input(z.object({
      tenantId: z.number().int().positive().default(1),
      id: z.number(),
      quantity: z.number().int().min(1).max(20).optional(),
      unitPrice: z.number().min(0).max(10000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });

      const [row] = await db.select().from(appointmentAddOns).where(and(
        eq(appointmentAddOns.id, input.id),
        eq(appointmentAddOns.tenantId, input.tenantId),
      )).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That add-on is no longer on this appointment" });
      await requireApprovedStaffAppointmentAccess(db, ctx.user, row.appointmentId);

      await db.update(appointmentAddOns).set({
        quantity: input.quantity ?? row.quantity,
        unitPrice: input.unitPrice !== undefined ? input.unitPrice.toFixed(2) : row.unitPrice,
      }).where(eq(appointmentAddOns.id, input.id));

      return { success: true };
    }),

  remove: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });

      const [row] = await db.select().from(appointmentAddOns).where(and(
        eq(appointmentAddOns.id, input.id),
        eq(appointmentAddOns.tenantId, input.tenantId),
      )).limit(1);
      if (!row) return { success: true };
      await requireApprovedStaffAppointmentAccess(db, ctx.user, row.appointmentId);

      await db.delete(appointmentAddOns).where(eq(appointmentAddOns.id, input.id));
      return { success: true };
    }),
});

/**
 * The add-ons on an appointment, shaped for an invoice.
 *
 * Exported for the two places that raise one — automatically on
 * completion, and from "Create Bills" — so the itemised lines cannot
 * drift apart between them.
 */
export async function loadAddOnsForInvoice(db: any, tenantId: number, appointmentId: number) {
  const rows = await db.select({
    name: appointmentAddOns.name,
    unitPrice: appointmentAddOns.unitPrice,
    quantity: appointmentAddOns.quantity,
  }).from(appointmentAddOns).where(and(
    eq(appointmentAddOns.tenantId, tenantId),
    eq(appointmentAddOns.appointmentId, appointmentId),
  )).orderBy(asc(appointmentAddOns.id));
  return rows as { name: string; unitPrice: string; quantity: number }[];
}
