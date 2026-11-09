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
import { and, asc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, operationalProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { appointmentAddOns, pricingServices, retailProducts, staff } from "../../drizzle/schema";
import { requireApprovedStaffAppointmentAccess } from "../staffAccess";
import { validateLineDiscount, MAX_DISCOUNT_REASON } from "../../shared/lineDiscount";
import { describeStockWarning, isRetailLine, stockAfterSale } from "../../shared/retailSale";
import { addOnRequiresManualPrice, addOnsTotal } from "../../shared/appointmentAddOns";

export const appointmentAddOnsRouter = router({
  /** The add-ons the salon offers, for the picker. */
  catalogue: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }).optional())
    .query(async ({ input, ctx }) => {
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
        eq(pricingServices.tenantId, tenantOf(ctx, input) ?? 1),
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
        eq(appointmentAddOns.tenantId, tenantOf(ctx, input)),
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
        eq(pricingServices.tenantId, tenantOf(ctx, input)),
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
        tenantId: tenantOf(ctx, input),
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

  /**
   * Put a retail product on the booking's cart.
   *
   * Andy, 09/11/2026: "Add retail items into the appointment card so
   * these can be added to the cart for checkout."
   *
   * Separate from `add` rather than a flag on it, because the two take
   * different catalogues, have different failure modes and only one of
   * them moves stock. A single procedure branching on which id arrived
   * would be one function doing two jobs with one set of guards.
   */
  addRetail: operationalProcedure
    .input(z.object({
      tenantId: z.number().int().positive().default(1),
      appointmentId: z.number(),
      retailProductId: z.number(),
      quantity: z.number().int().min(1).max(20).default(1),
      /** Overrides the shelf price. Staff discretion at the counter. */
      unitPrice: z.number().min(0).max(10000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const [product] = await db.select().from(retailProducts).where(and(
        eq(retailProducts.id, input.retailProductId),
        eq(retailProducts.tenantId, tenantId),
      )).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "That product is not in the catalogue" });
      /* Archived means withdrawn from sale. Reading the row and then
         refusing is deliberate: "not in the catalogue" for something
         staff can see in the Retail list would send them looking for a
         bug. */
      if (!product.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${product.name} is archived and not for sale` });
      }

      const unitPrice = input.unitPrice !== undefined
        ? input.unitPrice.toFixed(2)
        : (product.priceAud ?? "0.00");

      /*
       * The line and the stock move together or not at all. Without the
       * transaction a failed stock write leaves a sale on the bill that
       * never came off the shelf, which is the one of the two that
       * costs money.
       */
      const sale = stockAfterSale(Number(product.stockQty ?? 0), input.quantity);
      await db.transaction(async (tx: any) => {
        await tx.insert(appointmentAddOns).values({
          tenantId,
          appointmentId: input.appointmentId,
          retailProductId: product.id,
          // Snapshots, so a rename or a price rise never changes a past
          // bill — the same reason the service add-on copies them.
          name: product.name,
          unitPrice,
          quantity: input.quantity,
          createdByUserId: ctx.user?.id ?? null,
        });
        await tx.update(retailProducts)
          .set({ stockQty: sale.remaining })
          .where(and(eq(retailProducts.id, product.id), eq(retailProducts.tenantId, tenantId)));
      });

      return {
        success: true,
        name: product.name,
        unitPrice,
        remaining: sale.remaining,
        warning: describeStockWarning(sale.warning, product.name),
      };
    }),

  /** Change what was charged, or how many. */
  update: operationalProcedure
    .input(z.object({
      tenantId: z.number().int().positive().default(1),
      id: z.number(),
      quantity: z.number().int().min(1).max(20).optional(),
      unitPrice: z.number().min(0).max(10000).optional(),
      /**
       * Who actually did it. Null clears it back to "whoever has the dog".
       * Andy, 27/10/2026: a teeth clean or a daycare on a two-dog booking
       * is often not done by that dog's own groomer.
       */
      staffId: z.number().int().positive().nullable().optional(),
      /** A discount on this line: percent OR amount, never both. */
      discountKind: z.enum(["percent", "amount"]).nullable().optional(),
      discountValue: z.union([z.number(), z.string()]).nullable().optional(),
      discountReason: z.string().max(MAX_DISCOUNT_REASON).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });

      const [row] = await db.select().from(appointmentAddOns).where(and(
        eq(appointmentAddOns.id, input.id),
        eq(appointmentAddOns.tenantId, tenantOf(ctx, input)),
      )).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That add-on is no longer on this appointment" });
      await requireApprovedStaffAppointmentAccess(db, ctx.user, row.appointmentId);

      const quantity = input.quantity ?? row.quantity;
      const unitPrice = input.unitPrice !== undefined ? input.unitPrice.toFixed(2) : row.unitPrice;

      // Only touch the discount when the caller mentions it, so editing a
      // quantity cannot silently wipe a discount somebody agreed.
      const discountTouched = input.discountKind !== undefined || input.discountValue !== undefined;
      let discountFields: Record<string, unknown> = {};
      if (discountTouched) {
        // Validated against the line's own gross, so "$50 off" on a $35
        // add-on is refused here rather than silently clamped later.
        const gross = (Number(unitPrice) * Math.max(1, quantity)).toFixed(2);
        const check = validateLineDiscount({
          kind: input.discountKind ?? null,
          value: input.discountValue ?? null,
          reason: input.discountReason ?? null,
          gross,
        });
        if (!check.ok) throw new TRPCError({ code: "BAD_REQUEST", message: check.error });
        discountFields = {
          discountPercent: check.discount?.kind === "percent" ? String(check.discount.value) : null,
          discountAmount: check.discount?.kind === "amount" ? check.discount.value.toFixed(2) : null,
          discountReason: check.reason,
        };
      }

      await db.update(appointmentAddOns).set({
        quantity,
        unitPrice,
        ...(input.staffId !== undefined ? { staffId: input.staffId } : {}),
        ...discountFields,
      }).where(eq(appointmentAddOns.id, input.id));

      return { success: true };
    }),

  /**
   * Tick an extra off once it has been done.
   *
   * Lauren, 27/10/2026: "We need them to be able to put a tick next to
   * it so we know it's checked off & completed." The board already
   * showed which extras a dog needed; nothing said whether one had
   * happened, so checking meant walking out the back to ask.
   *
   * operationalProcedure, and that is the whole point: the bather who
   * did the teeth clean is a restricted staff account, and they are
   * exactly who should be ticking it. protectedProcedure would reject
   * them and leave the job to whoever has an office login.
   *
   * Toggles rather than only setting, because the commonest correction
   * is a tick on the wrong line.
   */
  setDone: operationalProcedure
    .input(z.object({
      tenantId: z.number().int().positive().default(1),
      id: z.number(),
      done: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });

      const [row] = await db.select().from(appointmentAddOns).where(and(
        eq(appointmentAddOns.id, input.id),
        eq(appointmentAddOns.tenantId, tenantOf(ctx, input)),
      )).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That add-on is no longer on this appointment" });
      await requireApprovedStaffAppointmentAccess(db, ctx.user, row.appointmentId);

      // Who ticked it comes from the signed-in user's staff record, not
      // from the client: the point of recording it is that it cannot be
      // claimed on somebody else's behalf.
      const [me] = await db.select({ id: staff.id }).from(staff)
        .where(and(eq(staff.tenantId, tenantOf(ctx, input)), eq(staff.userId, ctx.user.id))).limit(1);

      await db.update(appointmentAddOns).set({
        completedAt: input.done ? new Date() : null,
        completedByStaffId: input.done ? (me?.id ?? null) : null,
      }).where(eq(appointmentAddOns.id, input.id));

      return { success: true, done: input.done };
    }),

  remove: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });

      const [row] = await db.select().from(appointmentAddOns).where(and(
        eq(appointmentAddOns.id, input.id),
        eq(appointmentAddOns.tenantId, tenantOf(ctx, input)),
      )).limit(1);
      if (!row) return { success: true };
      await requireApprovedStaffAppointmentAccess(db, ctx.user, row.appointmentId);

      /*
       * A retail line goes back on the shelf when it comes off the bill.
       *
       * Stock falls when the line is ADDED, so every add needs exactly
       * one matching restore or the count drifts down for ever — the
       * client changes their mind, the line comes off, and nothing
       * notices the shampoo is still there.
       *
       * Both writes in one transaction for the same reason as the sale:
       * a delete that succeeds while the restock fails loses the item.
       */
      if (isRetailLine(row)) {
        await db.transaction(async (tx: any) => {
          await tx.delete(appointmentAddOns).where(eq(appointmentAddOns.id, input.id));
          await tx.update(retailProducts)
            .set({ stockQty: sql`${retailProducts.stockQty} + ${row.quantity}` })
            .where(and(
              eq(retailProducts.id, row.retailProductId as number),
              eq(retailProducts.tenantId, tenantOf(ctx, input)),
            ));
        });
        return { success: true, restocked: row.quantity };
      }

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
    // The discount columns belong HERE, not only on the editor's list.
    // Without them buildInvoiceLines sees no discount and bills the full
    // rate — the money is recorded and never taken off, which is the
    // same shape as the monthly-billing miss on 23/10/2026.
    discountPercent: appointmentAddOns.discountPercent,
    discountAmount: appointmentAddOns.discountAmount,
    discountReason: appointmentAddOns.discountReason,
  }).from(appointmentAddOns).where(and(
    eq(appointmentAddOns.tenantId, tenantId),
    eq(appointmentAddOns.appointmentId, appointmentId),
  )).orderBy(asc(appointmentAddOns.id));
  return rows as {
    name: string; unitPrice: string; quantity: number;
    discountPercent: string | null; discountAmount: string | null; discountReason: string | null;
  }[];
}
