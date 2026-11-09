/**
 * The counter till: selling retail to somebody with no booking.
 *
 * Lauren Romari, 10/11/2026: "what happens if someone walks in just
 * wanting to buy retail?" Until this, nothing — see `shared/counterSale.ts`
 * for why it lands on an invoice rather than in a new table.
 *
 * `operationalProcedure` throughout. The person at the counter when a
 * client picks up a bag of treats is whoever is nearest the door, and
 * that is frequently a bather or a receptionist. `protectedProcedure`
 * rejects restricted staff accounts and would leave the salon floor
 * unable to take money.
 *
 * Voiding is operational too, and deliberately limited to TODAY'S sales:
 * the person who mis-rings a sale is the person standing there, and
 * making them find Andy to fix a typo is how a till ends up with a
 * drawer that does not reconcile. Anything older is a refund decision,
 * not a typo, and this does not pretend to handle refunds.
 */
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { router, operationalProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import {
  clients,
  invoiceLineItems,
  invoices,
  retailProducts,
  users,
} from "../../drizzle/schema";
import { describeStockWarning, stockAfterSale } from "../../shared/retailSale";
import {
  counterSaleInvoiceNumber,
  counterSaleLineTotal,
  counterSaleRefusal,
  counterSaleStatus,
  counterSaleTotals,
  describeCounterSale,
  MAX_COUNTER_SALE_LINES,
  MAX_LINE_QUANTITY,
  type CounterSaleLine,
} from "../../shared/counterSale";
import {
  brisbaneDateKey,
  brisbaneExplicitRange,
} from "../../shared/localDateTime";
import { invoiceDueAt } from "../../shared/appointmentInvoicing";

/**
 * A counter sale, structurally: a bill with no booking and no membership
 * behind it that has at least one line naming a retail product.
 *
 * Identified by its SHAPE rather than by its `SHOP-` number, because the
 * number is a label a human reads and the shape is what the money
 * questions actually ask. A groom's bill carries an appointment and
 * membership arrears carry a membership, so neither can be mistaken for
 * one of these.
 */
function isCounterSale(db: any) {
  return and(
    isNull(invoices.appointmentId),
    isNull(invoices.membershipId),
    sql`EXISTS (
      SELECT 1 FROM ${invoiceLineItems}
      WHERE ${invoiceLineItems.invoiceId} = ${invoices.id}
        AND ${invoiceLineItems.productId} IS NOT NULL
    )`
  );
}

export const counterSaleRouter = router({
  /**
   * Ring up a sale.
   *
   * Everything happens in one transaction. A bill without its lines is
   * an unexplained charge on somebody's account; stock taken off the
   * shelf without a bill is a product nobody paid for. Neither is
   * recoverable from the other half, so they go together or not at all.
   */
  sell: operationalProcedure
    .input(
      z.object({
        tenantId: z.number().int().positive().default(1),
        clientId: z.number().int().positive(),
        lines: z
          .array(
            z.object({
              retailProductId: z.number().int().positive(),
              quantity: z
                .number()
                .int()
                .min(1)
                .max(MAX_LINE_QUANTITY)
                .default(1),
              /** Overrides the shelf price. Staff discretion at the counter. */
              unitPrice: z.number().min(0).max(10000).optional(),
            })
          )
          .min(1)
          .max(MAX_COUNTER_SALE_LINES),
        /**
         * How the money was taken, or null to leave a bill to send. The
         * enum is `invoices.payment_method`, which has no "card" — the
         * terminal is eftpos and a payment link is stripe.
         */
        paymentMethod: z
          .enum(["cash", "eftpos", "stripe", "bank_transfer"])
          .nullable()
          .default(null),
        note: z.string().trim().max(400).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Database unavailable",
        });
      const tenantId = tenantOf(ctx, input);

      const [client] = await db
        .select({
          id: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
        })
        .from(clients)
        .where(
          and(eq(clients.id, input.clientId), eq(clients.tenantId, tenantId))
        )
        .limit(1);
      if (!client)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That client is not on this salon's books",
        });

      const wanted = [...new Set(input.lines.map(l => l.retailProductId))];
      const products = await db
        .select()
        .from(retailProducts)
        .where(
          and(
            eq(retailProducts.tenantId, tenantId),
            inArray(retailProducts.id, wanted)
          )
        );
      const byId = new Map<number, (typeof products)[number]>(
        products.map((p: any) => [p.id, p])
      );

      for (const id of wanted) {
        const product = byId.get(id);
        if (!product)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That product is not in the catalogue",
          });
        /* Archived means withdrawn from sale. Reading the row and then
           refusing by NAME is deliberate: "not in the catalogue" for
           something staff can still see in the Retail list would send
           them looking for a bug. Same wording as addRetail. */
        if (!product.isActive) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${product.name} is archived and not for sale`,
          });
        }
      }

      const lines: CounterSaleLine[] = input.lines.map(l => {
        const product = byId.get(l.retailProductId)!;
        return {
          retailProductId: product.id,
          // Snapshots, so a rename or a price rise never rewrites this bill.
          name: product.name,
          unitPrice:
            l.unitPrice !== undefined
              ? l.unitPrice.toFixed(2)
              : (product.priceAud ?? "0.00"),
          quantity: l.quantity,
        };
      });

      const refusal = counterSaleRefusal(lines);
      if (refusal)
        throw new TRPCError({ code: "BAD_REQUEST", message: refusal });

      const totals = counterSaleTotals(lines);
      const paidAtCounter = input.paymentMethod !== null;
      const soldAt = new Date();
      const invoiceNumber = counterSaleInvoiceNumber(
        soldAt,
        randomUUID().replace(/-/g, "").slice(0, 6)
      );

      /* Stock comes off per PRODUCT, not per line. The same thing rung
         up twice — two bags of treats added separately because the
         client changed their mind about how many — must take two off
         the shelf, not one. */
      const soldPerProduct = new Map<number, number>();
      for (const line of lines) {
        soldPerProduct.set(
          line.retailProductId,
          (soldPerProduct.get(line.retailProductId) ?? 0) + line.quantity
        );
      }

      const warnings: string[] = [];
      let invoiceId = 0;
      await db.transaction(async (tx: any) => {
        const [created] = await tx.insert(invoices).values({
          tenantId,
          clientId: client.id,
          // The two nulls are what MAKE this a counter sale. See isCounterSale.
          appointmentId: null,
          membershipId: null,
          invoiceNumber,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          status: counterSaleStatus(paidAtCounter),
          paymentMethod: input.paymentMethod ?? undefined,
          paidAt: paidAtCounter ? soldAt : undefined,
          dueAt: paidAtCounter ? undefined : invoiceDueAt(soldAt),
          notes: [describeCounterSale(lines), input.note]
            .filter(Boolean)
            .join(" — "),
        });
        invoiceId = Number(created.insertId);

        await tx.insert(invoiceLineItems).values(
          lines.map(line => ({
            invoiceId,
            description: line.name,
            quantity: String(line.quantity),
            unitPrice: line.unitPrice,
            lineTotal: counterSaleLineTotal(line),
            productId: line.retailProductId,
          }))
        );

        for (const [productId, quantity] of soldPerProduct) {
          const product = byId.get(productId)!;
          const sale = stockAfterSale(Number(product.stockQty ?? 0), quantity);
          await tx
            .update(retailProducts)
            .set({ stockQty: sale.remaining })
            .where(
              and(
                eq(retailProducts.id, productId),
                eq(retailProducts.tenantId, tenantId)
              )
            );
          const warning = describeStockWarning(sale.warning, product.name);
          if (warning) warnings.push(warning);
        }
      });

      return {
        success: true as const,
        invoiceId,
        invoiceNumber,
        total: totals.total,
        paid: paidAtCounter,
        clientName: `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim(),
        description: describeCounterSale(lines),
        warnings,
      };
    }),

  /**
   * The counter sales for one Brisbane day, newest first.
   *
   * Defaults to today, which is what the person at the till wants: what
   * has gone through this morning, and whether the one they just rang up
   * looks right.
   */
  forDay: operationalProcedure
    .input(
      z
        .object({
          tenantId: z.number().int().positive().default(1),
          day: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { day: brisbaneDateKey(), sales: [], takings: "0.00" };
      const tenantId = tenantOf(ctx, input ?? {});
      const day = input?.day ?? brisbaneDateKey();
      const { from, to } = brisbaneExplicitRange(day, day);

      const rows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          clientId: invoices.clientId,
          firstName: clients.firstName,
          lastName: clients.lastName,
          total: invoices.total,
          status: invoices.status,
          paymentMethod: invoices.paymentMethod,
          notes: invoices.notes,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .innerJoin(clients, eq(clients.id, invoices.clientId))
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            isCounterSale(db),
            gte(invoices.createdAt, from),
            lte(invoices.createdAt, to)
          )
        )
        .orderBy(desc(invoices.createdAt));

      /* Cancelled sales stay in the list — a void that vanishes is a
         void nobody can check — but they are not takings. */
      const takings = rows
        .filter((r: any) => r.status === "paid")
        .reduce(
          (sum: number, r: any) => sum + Math.round(Number(r.total) * 100),
          0
        );

      return { day, sales: rows, takings: (takings / 100).toFixed(2) };
    }),

  /**
   * Undo a sale rung up by mistake.
   *
   * Cancels the bill rather than deleting it, and puts the stock back.
   * A till that can make a record disappear is a till that cannot be
   * audited, and `cancelled` is already excluded from every paid total
   * in the app.
   */
  voidSale: operationalProcedure
    .input(
      z.object({
        tenantId: z.number().int().positive().default(1),
        invoiceId: z.number().int().positive(),
        reason: z.string().trim().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Database unavailable",
        });
      const tenantId = tenantOf(ctx, input);

      const [sale] = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          notes: invoices.notes,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.id, input.invoiceId),
            eq(invoices.tenantId, tenantId),
            isCounterSale(db)
          )
        )
        .limit(1);
      if (!sale)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That is not a counter sale on this salon's books",
        });
      if (sale.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${sale.invoiceNumber} has already been voided`,
        });
      }

      const today = brisbaneExplicitRange(brisbaneDateKey(), brisbaneDateKey());
      if (sale.createdAt < today.from || sale.createdAt > today.to) {
        /* Deliberate. See the note at the top of this file: a sale from
           another day is a refund decision, and this is not a refund. */
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${sale.invoiceNumber} was not rung up today, so it needs a refund rather than a void.`,
        });
      }

      const soldLines = await db
        .select({
          productId: invoiceLineItems.productId,
          quantity: invoiceLineItems.quantity,
        })
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, sale.id));

      const backPerProduct = new Map<number, number>();
      for (const line of soldLines) {
        if (line.productId === null) continue;
        backPerProduct.set(
          line.productId,
          (backPerProduct.get(line.productId) ?? 0) + Number(line.quantity)
        );
      }

      const who = ctx.user?.id ? `user ${ctx.user.id}` : "a staff member";
      await db.transaction(async (tx: any) => {
        await tx
          .update(invoices)
          .set({
            status: "cancelled",
            paidAt: null,
            notes: [
              sale.notes,
              `Voided by ${who} on ${brisbaneDateKey()}${input.reason ? `: ${input.reason}` : ""}`,
            ]
              .filter(Boolean)
              .join(" — "),
          })
          .where(
            and(eq(invoices.id, sale.id), eq(invoices.tenantId, tenantId))
          );

        /* Back on the shelf. Written as an increment rather than a
           computed figure so a stocktake between the sale and the void
           is not silently overwritten with a stale number. */
        for (const [productId, quantity] of backPerProduct) {
          await tx
            .update(retailProducts)
            .set({ stockQty: sql`${retailProducts.stockQty} + ${quantity}` })
            .where(
              and(
                eq(retailProducts.id, productId),
                eq(retailProducts.tenantId, tenantId)
              )
            );
        }
      });

      return {
        success: true as const,
        invoiceNumber: sale.invoiceNumber,
        restored: backPerProduct.size,
      };
    }),
});
