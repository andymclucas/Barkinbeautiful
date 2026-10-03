import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  agreementDocuments, agreementSignatures, clientReviews, clientNotes,
  servicePackages, clientPackages, clientPackageRedemptions,
  petVaccinations, pets, clients, users,
} from "../../drizzle/schema";
import { SEED_AGREEMENTS } from "../seed/agreementBodies";

/**
 * The client record: agreements, reviews, packages, pet paperwork, notes.
 *
 * Kept out of routers.ts, which is already 6,600 lines. Everything here is
 * protectedProcedure — the client page it serves is owner/admin surface
 * and shows a client's full billing history, so a restricted groomer must
 * not reach it.
 */

const TENANT = z.object({ tenantId: z.number().int().positive().default(1) });

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return d;
}

/** Nobody may act on another tenant's client, whatever id they pass. */
async function assertClient(tenantId: number, clientId: number) {
  const d = await db();
  const [row] = await d.select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
}

// ─── Agreements ──────────────────────────────────────────────────────────────
export const agreementsRouter = router({
  /** Every live document, newest version of each slug. */
  list: protectedProcedure.input(TENANT).query(async ({ input }) => {
    const d = await db();
    const rows = await d.select()
      .from(agreementDocuments)
      .where(and(eq(agreementDocuments.tenantId, input.tenantId), sql`${agreementDocuments.status} <> 'archived'`))
      .orderBy(desc(agreementDocuments.version));
    const newest = new Map<string, typeof rows[number]>();
    for (const r of rows) if (!newest.has(r.slug)) newest.set(r.slug, r);
    return Array.from(newest.values()).sort((a, b) => a.title.localeCompare(b.title));
  }),

  get: protectedProcedure
    .input(TENANT.extend({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const d = await db();
      const [row] = await d.select().from(agreementDocuments)
        .where(and(eq(agreementDocuments.id, input.id), eq(agreementDocuments.tenantId, input.tenantId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Agreement not found" });
      return row;
    }),

  /**
   * Save a document.
   *
   * A document nobody has signed is edited in place. The moment it has a
   * signature the edit becomes a NEW version instead, because a signature
   * has to keep meaning "agreed to these exact words" — editing underneath
   * it would rewrite what someone already agreed to.
   */
  save: protectedProcedure
    .input(TENANT.extend({
      id: z.number().int().positive().optional(),
      slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1),
      requirement: z.enum(["sign_once", "every_booking", "manual"]),
      status: z.enum(["draft", "active", "archived"]).default("active"),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const userId = ctx.user?.id ? Number(ctx.user.id) : null;

      if (!input.id) {
        const [existing] = await d.select({ v: agreementDocuments.version })
          .from(agreementDocuments)
          .where(and(eq(agreementDocuments.tenantId, input.tenantId), eq(agreementDocuments.slug, input.slug)))
          .orderBy(desc(agreementDocuments.version)).limit(1);
        const version = (existing?.v ?? 0) + 1;
        await d.insert(agreementDocuments).values({
          tenantId: input.tenantId, slug: input.slug, title: input.title, body: input.body,
          requirement: input.requirement, status: input.status, version,
          createdByUserId: userId,
        });
        return { created: true, version };
      }

      const [current] = await d.select().from(agreementDocuments)
        .where(and(eq(agreementDocuments.id, input.id), eq(agreementDocuments.tenantId, input.tenantId)))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Agreement not found" });

      const [signed] = await d.select({ n: sql<number>`COUNT(*)` })
        .from(agreementSignatures)
        .where(and(
          eq(agreementSignatures.tenantId, input.tenantId),
          eq(agreementSignatures.documentId, current.id),
          eq(agreementSignatures.documentVersion, current.version),
        ));
      const hasSignatures = Number(signed?.n ?? 0) > 0;
      const wordsChanged = current.body !== input.body || current.title !== input.title;

      if (hasSignatures && wordsChanged) {
        const [newest] = await d.select({ v: agreementDocuments.version })
          .from(agreementDocuments)
          .where(and(eq(agreementDocuments.tenantId, input.tenantId), eq(agreementDocuments.slug, current.slug)))
          .orderBy(desc(agreementDocuments.version)).limit(1);
        const version = (newest?.v ?? current.version) + 1;
        await d.insert(agreementDocuments).values({
          tenantId: input.tenantId, slug: current.slug, title: input.title, body: input.body,
          requirement: input.requirement, status: input.status, version, createdByUserId: userId,
        });
        return { created: true, version, supersededBecauseSigned: true };
      }

      await d.update(agreementDocuments).set({
        title: input.title, body: input.body, requirement: input.requirement,
        status: input.status, updatedAt: new Date(),
      }).where(eq(agreementDocuments.id, current.id));
      return { created: false, version: current.version };
    }),

  archive: protectedProcedure
    .input(TENANT.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(agreementDocuments).set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(agreementDocuments.id, input.id), eq(agreementDocuments.tenantId, input.tenantId)));
      return { success: true };
    }),

  /** Documents plus whether this client has signed the current version. */
  forClient: protectedProcedure
    .input(TENANT.extend({ clientId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await assertClient(input.tenantId, input.clientId);
      const d = await db();
      const docs = await d.select().from(agreementDocuments)
        .where(and(eq(agreementDocuments.tenantId, input.tenantId), eq(agreementDocuments.status, "active")))
        .orderBy(desc(agreementDocuments.version));
      const newest = new Map<string, typeof docs[number]>();
      for (const doc of docs) if (!newest.has(doc.slug)) newest.set(doc.slug, doc);
      const live = Array.from(newest.values());
      if (live.length === 0) return [];

      const sigs = await d.select().from(agreementSignatures)
        .where(and(
          eq(agreementSignatures.tenantId, input.tenantId),
          eq(agreementSignatures.clientId, input.clientId),
          inArray(agreementSignatures.documentId, live.map(doc => doc.id)),
        ));

      return live
        .map(doc => {
          const signed = sigs.find(s => s.documentId === doc.id && s.documentVersion === doc.version) ?? null;
          const older = sigs.find(s => s.documentId === doc.id && s.documentVersion !== doc.version) ?? null;
          return {
            id: doc.id, slug: doc.slug, title: doc.title, version: doc.version,
            requirement: doc.requirement, body: doc.body,
            signedAt: signed?.signedAt ?? null,
            signedName: signed?.signedName ?? null,
            // Signed an earlier wording: not "unsigned", but not current either.
            signedOlderVersion: !signed && older ? older.documentVersion : null,
          };
        })
        .sort((a, b) => a.title.localeCompare(b.title));
    }),

  /** Recorded at the counter: the client agreed, staff typed their name. */
  recordSignature: protectedProcedure
    .input(TENANT.extend({
      clientId: z.number().int().positive(),
      documentId: z.number().int().positive(),
      signedName: z.string().trim().min(1).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertClient(input.tenantId, input.clientId);
      const d = await db();
      const [doc] = await d.select({ id: agreementDocuments.id, version: agreementDocuments.version })
        .from(agreementDocuments)
        .where(and(eq(agreementDocuments.id, input.documentId), eq(agreementDocuments.tenantId, input.tenantId)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Agreement not found" });

      try {
        await d.insert(agreementSignatures).values({
          tenantId: input.tenantId, documentId: doc.id, documentVersion: doc.version,
          clientId: input.clientId, signedName: input.signedName,
          recordedByUserId: ctx.user?.id ? Number(ctx.user.id) : null,
        });
      } catch {
        // The unique key makes a double-click a no-op rather than two
        // signatures for the same words on the same day.
        throw new TRPCError({ code: "CONFLICT", message: "Already signed this version" });
      }
      return { success: true, version: doc.version };
    }),

  /**
   * One-time import of the six agreements Lauren wrote in MoeGo.
   *
   * Skips any slug that already exists, so running it twice is harmless
   * and it can never overwrite a document someone has signed.
   */
  importFromMoeGo: protectedProcedure
    .input(TENANT)
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const existing = await d.select({ slug: agreementDocuments.slug })
        .from(agreementDocuments)
        .where(eq(agreementDocuments.tenantId, input.tenantId));
      const have = new Set(existing.map(r => r.slug));
      const added: string[] = [];
      for (const a of SEED_AGREEMENTS) {
        if (have.has(a.slug)) continue;
        await d.insert(agreementDocuments).values({
          tenantId: input.tenantId, slug: a.slug, title: a.title, body: a.body,
          requirement: a.requirement, status: "active", version: 1,
          createdByUserId: ctx.user?.id ? Number(ctx.user.id) : null,
        });
        added.push(a.slug);
      }
      return { added, skipped: SEED_AGREEMENTS.length - added.length };
    }),
});

// ─── Reviews ─────────────────────────────────────────────────────────────────
export const clientReviewsRouter = router({
  forClient: protectedProcedure
    .input(TENANT.extend({ clientId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await assertClient(input.tenantId, input.clientId);
      const d = await db();
      const rows = await d.select().from(clientReviews)
        .where(and(eq(clientReviews.tenantId, input.tenantId), eq(clientReviews.clientId, input.clientId)))
        .orderBy(desc(clientReviews.createdAt));
      const average = rows.length
        ? Math.round((rows.reduce((sum, r) => sum + r.rating, 0) / rows.length) * 10) / 10
        : null;
      return { reviews: rows, average, count: rows.length };
    }),

  create: protectedProcedure
    .input(TENANT.extend({
      clientId: z.number().int().positive(),
      appointmentId: z.number().int().positive().optional(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertClient(input.tenantId, input.clientId);
      const d = await db();
      await d.insert(clientReviews).values({
        tenantId: input.tenantId, clientId: input.clientId,
        appointmentId: input.appointmentId ?? null,
        rating: input.rating, comment: input.comment || null,
        source: "staff_entered",
        recordedByUserId: ctx.user?.id ? Number(ctx.user.id) : null,
      });
      return { success: true };
    }),

  remove: protectedProcedure
    .input(TENANT.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.delete(clientReviews)
        .where(and(eq(clientReviews.id, input.id), eq(clientReviews.tenantId, input.tenantId)));
      return { success: true };
    }),
});

// ─── Packages ────────────────────────────────────────────────────────────────
export const packagesRouter = router({
  /** What the salon sells. */
  catalogue: protectedProcedure.input(TENANT).query(async ({ input }) => {
    const d = await db();
    return d.select().from(servicePackages)
      .where(and(eq(servicePackages.tenantId, input.tenantId), eq(servicePackages.status, "active")))
      .orderBy(servicePackages.name);
  }),

  saveCatalogueItem: protectedProcedure
    .input(TENANT.extend({
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(2000).optional(),
      serviceType: z.string().trim().max(64).optional(),
      credits: z.number().int().min(1).max(100),
      price: z.number().nonnegative(),
      validForWeeks: z.number().int().min(1).max(260).optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const values = {
        name: input.name,
        description: input.description || null,
        serviceType: input.serviceType || null,
        credits: input.credits,
        price: input.price.toFixed(2),
        validForWeeks: input.validForWeeks ?? null,
        updatedAt: new Date(),
      };
      if (input.id) {
        await d.update(servicePackages).set(values)
          .where(and(eq(servicePackages.id, input.id), eq(servicePackages.tenantId, input.tenantId)));
        return { id: input.id };
      }
      await d.insert(servicePackages).values({ tenantId: input.tenantId, ...values });
      return { id: null };
    }),

  archiveCatalogueItem: protectedProcedure
    .input(TENANT.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(servicePackages).set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(servicePackages.id, input.id), eq(servicePackages.tenantId, input.tenantId)));
      return { success: true };
    }),

  forClient: protectedProcedure
    .input(TENANT.extend({ clientId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await assertClient(input.tenantId, input.clientId);
      const d = await db();
      const rows = await d.select().from(clientPackages)
        .where(and(eq(clientPackages.tenantId, input.tenantId), eq(clientPackages.clientId, input.clientId)))
        .orderBy(desc(clientPackages.purchasedAt));
      const now = Date.now();
      return rows.map(r => ({
        ...r,
        creditsLeft: r.creditsTotal - r.creditsUsed,
        // Expiry is worked out on read: a package quietly lapses on its
        // date whether or not anything ran that day.
        expired: r.expiresAt ? r.expiresAt.getTime() <= now : false,
      }));
    }),

  /**
   * Sell a package. The terms are copied, not joined — changing "5 baths"
   * to 4 next year must not take a credit off someone who paid for five.
   */
  purchase: protectedProcedure
    .input(TENANT.extend({
      clientId: z.number().int().positive(),
      packageId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertClient(input.tenantId, input.clientId);
      const d = await db();
      const [pkg] = await d.select().from(servicePackages)
        .where(and(eq(servicePackages.id, input.packageId), eq(servicePackages.tenantId, input.tenantId)))
        .limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
      if (pkg.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "That package is archived" });

      const expiresAt = pkg.validForWeeks
        ? new Date(Date.now() + pkg.validForWeeks * 7 * 24 * 60 * 60 * 1000)
        : null;
      await d.insert(clientPackages).values({
        tenantId: input.tenantId, clientId: input.clientId, packageId: pkg.id,
        packageName: pkg.name, creditsTotal: pkg.credits, pricePaid: pkg.price,
        expiresAt, soldByUserId: ctx.user?.id ? Number(ctx.user.id) : null,
      });
      return { success: true };
    }),

  redeem: protectedProcedure
    .input(TENANT.extend({
      clientPackageId: z.number().int().positive(),
      appointmentId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const [cp] = await d.select().from(clientPackages)
        .where(and(eq(clientPackages.id, input.clientPackageId), eq(clientPackages.tenantId, input.tenantId)))
        .limit(1);
      if (!cp) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
      if (cp.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "That package is no longer active" });
      if (cp.expiresAt && cp.expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That package has expired" });
      }
      if (cp.creditsUsed >= cp.creditsTotal) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No credits left on that package" });
      }

      try {
        await d.insert(clientPackageRedemptions).values({
          tenantId: input.tenantId, clientPackageId: cp.id, appointmentId: input.appointmentId,
          redeemedByUserId: ctx.user?.id ? Number(ctx.user.id) : null,
        });
      } catch {
        // Unique on (package, appointment): a double-click must not spend
        // two credits on one groom.
        throw new TRPCError({ code: "CONFLICT", message: "A credit is already used on this appointment" });
      }

      const used = cp.creditsUsed + 1;
      await d.update(clientPackages)
        .set({ creditsUsed: used, status: used >= cp.creditsTotal ? "used_up" : "active" })
        .where(eq(clientPackages.id, cp.id));
      return { creditsLeft: cp.creditsTotal - used };
    }),
});

// ─── Pet paperwork ───────────────────────────────────────────────────────────
/** The kinds the salon actually tracks; free text would fragment into typos. */
export const VACCINATION_KINDS = ["C5", "Kennel cough", "Customer form", "Other"] as const;

export const petPaperworkRouter = router({
  /** Every pet on the client, each with its records — one query per page. */
  forClient: protectedProcedure
    .input(TENANT.extend({ clientId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await assertClient(input.tenantId, input.clientId);
      const d = await db();
      const owned = await d.select({ id: pets.id, name: pets.name })
        .from(pets)
        .where(and(eq(pets.clientId, input.clientId), eq(pets.tenantId, input.tenantId)));
      if (owned.length === 0) return [];

      const records = await d.select().from(petVaccinations)
        .where(and(
          eq(petVaccinations.tenantId, input.tenantId),
          inArray(petVaccinations.petId, owned.map(p => p.id)),
        ))
        .orderBy(desc(petVaccinations.expiresOn));

      const today = new Date().toISOString().slice(0, 10);
      return owned.map(pet => ({
        petId: pet.id,
        petName: pet.name,
        records: records
          .filter(r => r.petId === pet.id)
          .map(r => ({
            ...r,
            // Compared as date strings, so "expired" does not flip at a
            // timezone boundary the way a Date comparison would.
            expired: r.expiresOn ? String(r.expiresOn) < today : false,
          })),
      }));
    }),

  save: protectedProcedure
    .input(TENANT.extend({
      id: z.number().int().positive().optional(),
      petId: z.number().int().positive(),
      kind: z.string().trim().min(1).max(64),
      administeredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notes: z.string().trim().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const [pet] = await d.select({ id: pets.id }).from(pets)
        .where(and(eq(pets.id, input.petId), eq(pets.tenantId, input.tenantId))).limit(1);
      if (!pet) throw new TRPCError({ code: "NOT_FOUND", message: "Pet not found" });

      const values = {
        kind: input.kind,
        administeredOn: input.administeredOn ?? null,
        expiresOn: input.expiresOn ?? null,
        notes: input.notes || null,
        verifiedAt: new Date(),
        verifiedByUserId: ctx.user?.id ? Number(ctx.user.id) : null,
        updatedAt: new Date(),
      };
      if (input.id) {
        await d.update(petVaccinations).set(values)
          .where(and(eq(petVaccinations.id, input.id), eq(petVaccinations.tenantId, input.tenantId)));
        return { success: true };
      }
      await d.insert(petVaccinations).values({ tenantId: input.tenantId, petId: input.petId, ...values });
      return { success: true };
    }),

  remove: protectedProcedure
    .input(TENANT.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.delete(petVaccinations)
        .where(and(eq(petVaccinations.id, input.id), eq(petVaccinations.tenantId, input.tenantId)));
      return { success: true };
    }),
});

// ─── Client notes ────────────────────────────────────────────────────────────
export const clientNotesRouter = router({
  forClient: protectedProcedure
    .input(TENANT.extend({ clientId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await assertClient(input.tenantId, input.clientId);
      const d = await db();
      const rows = await d.select({
        id: clientNotes.id,
        body: clientNotes.body,
        pinned: clientNotes.pinned,
        createdAt: clientNotes.createdAt,
        updatedAt: clientNotes.updatedAt,
        authorName: users.name,
      })
        .from(clientNotes)
        .leftJoin(users, eq(clientNotes.createdByUserId, users.id))
        .where(and(eq(clientNotes.tenantId, input.tenantId), eq(clientNotes.clientId, input.clientId)))
        .orderBy(desc(clientNotes.pinned), desc(clientNotes.createdAt));

      // The old single free-text field still holds whatever was typed
      // before notes became a list. Shown, clearly marked, rather than
      // silently dropped.
      const [legacy] = await d.select({ notes: clients.notes })
        .from(clients)
        .where(and(eq(clients.id, input.clientId), eq(clients.tenantId, input.tenantId)))
        .limit(1);

      return { notes: rows, legacyNote: legacy?.notes?.trim() || null };
    }),

  create: protectedProcedure
    .input(TENANT.extend({
      clientId: z.number().int().positive(),
      body: z.string().trim().min(1).max(4000),
      pinned: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertClient(input.tenantId, input.clientId);
      const d = await db();
      await d.insert(clientNotes).values({
        tenantId: input.tenantId, clientId: input.clientId, body: input.body,
        pinned: input.pinned, createdByUserId: ctx.user?.id ? Number(ctx.user.id) : null,
      });
      return { success: true };
    }),

  update: protectedProcedure
    .input(TENANT.extend({
      id: z.number().int().positive(),
      body: z.string().trim().min(1).max(4000).optional(),
      pinned: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.body !== undefined) patch.body = input.body;
      if (input.pinned !== undefined) patch.pinned = input.pinned;
      await d.update(clientNotes).set(patch)
        .where(and(eq(clientNotes.id, input.id), eq(clientNotes.tenantId, input.tenantId)));
      return { success: true };
    }),

  remove: protectedProcedure
    .input(TENANT.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.delete(clientNotes)
        .where(and(eq(clientNotes.id, input.id), eq(clientNotes.tenantId, input.tenantId)));
      return { success: true };
    }),
});
