import { z } from "zod";
import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, operationalProcedure, protectedProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { petCodes, pets } from "../../drizzle/schema";
import { parsePetCodes } from "../../shared/petCodes";

/**
 * The salon's pet-code vocabulary, managed from Pricing & Services.
 *
 * Reading is `operationalProcedure`: the board, the pet record and the
 * hover card all show what a code means, and those are the screens a
 * bather works from. Writing is `protectedProcedure`, so a restricted
 * groomer cannot rename the vocabulary the whole salon reads.
 *
 * Codes are a VOCABULARY, not an authority — `pets.moego_code_labels`
 * stays free text and a groomer can type something that is not in here
 * (Andy, 22/10/2026). That shapes two things below: deleting a code in
 * use does not touch any dog, and renaming one rewrites every dog that
 * carries it, because the text IS the join.
 */

const codeInput = z.object({
  tenantId: z.number().optional(),
  code: z.string().trim().min(1).max(80),
  description: z.string().trim().max(255).optional().nullable(),
  colourHex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #7c3aed").optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

/** How many dogs carry this code right now. The text is the join. */
async function usageOf(db: any, tenantId: number, code: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(pets)
    .where(and(
      eq(pets.tenantId, tenantId),
      // Comma-joined, so match the code as a whole item rather than a
      // substring — "#3" must not match "#3 PFFT", and "Bites" must not
      // match a code that merely contains it.
      sql`FIND_IN_SET(${code}, REPLACE(${pets.moegoCodeLabels}, ', ', ',')) > 0`,
    ));
  return Number(row?.n ?? 0);
}

export const petCodesRouter = router({
  /** The whole vocabulary, with how many dogs carry each. */
  list: operationalProcedure
    .input(z.object({ tenantId: z.number().optional(), includeInactive: z.boolean().default(true) }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = tenantOf(ctx, input);
      const rows = await db.select().from(petCodes)
        .where(input?.includeInactive === false
          ? and(eq(petCodes.tenantId, tenantId), eq(petCodes.isActive, true))
          : eq(petCodes.tenantId, tenantId))
        .orderBy(asc(petCodes.sortOrder), asc(petCodes.code));

      /**
       * Counted in JS, not in SQL.
       *
       * This was a JSON_TABLE query. **TiDB does not support
       * JSON_TABLE** — it parses as a syntax error, so every call threw
       * and the picker sits on the client record, which meant opening
       * any client record showed "Some data could not be loaded".
       * Verified against 8.0.11-TiDB-v8.5.3-serverless on 23/10/2026;
       * FIND_IN_SET, used elsewhere in this file, is fine.
       *
       * The data is small enough that this is not a compromise: 1,384
       * dogs carry a short comma-joined string, and parsing them here
       * uses the same parser every display path uses, so the count
       * cannot disagree with what is rendered.
       */
      const labelRows = await db
        .select({ labels: pets.moegoCodeLabels })
        .from(pets)
        .where(and(
          eq(pets.tenantId, tenantId),
          isNotNull(pets.moegoCodeLabels),
          ne(pets.moegoCodeLabels, ""),
        ));
      const used = new Map<string, number>();
      for (const row of labelRows) {
        for (const code of parsePetCodes(row.labels)) {
          const key = code.trim().toLowerCase();
          used.set(key, (used.get(key) ?? 0) + 1);
        }
      }
      return rows.map((row: any) => ({ ...row, dogsUsing: used.get(String(row.code).trim().toLowerCase()) ?? 0 }));
    }),

  create: protectedProcedure
    .input(codeInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      const [existing] = await db.select({ id: petCodes.id }).from(petCodes)
        .where(and(eq(petCodes.tenantId, tenantId), eq(petCodes.code, input.code))).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: `"${input.code}" is already in the list` });
      const [result] = await db.insert(petCodes).values({
        tenantId, code: input.code,
        description: input.description ?? null,
        colourHex: input.colourHex ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      });
      return { id: (result as any).insertId as number };
    }),

  update: protectedProcedure
    .input(codeInput.extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      const [current] = await db.select().from(petCodes)
        .where(and(eq(petCodes.id, input.id), eq(petCodes.tenantId, tenantId))).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "That code is not in this salon's list" });

      const renamed = current.code.trim().toLowerCase() !== input.code.trim().toLowerCase()
        || current.code !== input.code;
      let dogsUpdated = 0;
      if (renamed) {
        const [clash] = await db.select({ id: petCodes.id }).from(petCodes)
          .where(and(eq(petCodes.tenantId, tenantId), eq(petCodes.code, input.code))).limit(1);
        if (clash && clash.id !== input.id) {
          throw new TRPCError({ code: "CONFLICT", message: `"${input.code}" is already in the list` });
        }
        /**
         * A rename has to rewrite every dog carrying the old text,
         * because the text IS the join. Doing it in the same breath as
         * the catalogue row means the board never shows a code whose
         * meaning has just vanished.
         *
         * FIND_IN_SET on a normalised copy, so "#3" does not match
         * "#3 PFFT" and the comma-space the import wrote is handled.
         */
        const [res] = await db.execute(sql`
          UPDATE ${pets}
             SET ${pets.moegoCodeLabels} = TRIM(BOTH ',' FROM REPLACE(
                   CONCAT(',', REPLACE(${pets.moegoCodeLabels}, ', ', ','), ','),
                   CONCAT(',', ${current.code}, ','),
                   CONCAT(',', ${input.code}, ',')))
           WHERE ${pets.tenantId} = ${tenantId}
             AND FIND_IN_SET(${current.code}, REPLACE(${pets.moegoCodeLabels}, ', ', ',')) > 0`);
        dogsUpdated = Number((res as any)?.affectedRows ?? 0);
      }

      await db.update(petCodes).set({
        code: input.code,
        description: input.description ?? null,
        colourHex: input.colourHex ?? null,
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        updatedAt: new Date(),
      }).where(and(eq(petCodes.id, input.id), eq(petCodes.tenantId, tenantId)));

      return { success: true, renamed, dogsUpdated };
    }),

  /**
   * Remove a code from the vocabulary.
   *
   * It does NOT strip the code from any dog. A code on a dog is a fact a
   * groomer wrote — "DOG AGGRESSIVE" is not less true because somebody
   * tidied the list — so deleting here only stops it being offered, and
   * the badge keeps rendering as itself. `dogsUsing` tells the caller
   * how many dogs that is, so the UI can warn before the click.
   */
  delete: protectedProcedure
    .input(z.object({ tenantId: z.number().optional(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      const [current] = await db.select().from(petCodes)
        .where(and(eq(petCodes.id, input.id), eq(petCodes.tenantId, tenantId))).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "That code is not in this salon's list" });
      const dogsUsing = await usageOf(db, tenantId, current.code);
      await db.delete(petCodes).where(and(eq(petCodes.id, input.id), eq(petCodes.tenantId, tenantId)));
      return { success: true, code: current.code, dogsStillCarryingIt: dogsUsing };
    }),
});
