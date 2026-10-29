/**
 * The waitlist: clients wanting a slot that does not exist yet.
 *
 * The flow has three hands on it, on purpose.
 *
 *   JOIN — a client goes on the list for a dog, a window and ideally a
 *   groomer. Added by staff while they are already on the phone, which
 *   is when the conversation actually happens.
 *
 *   OFFER — a booking is cancelled, staff see who was waiting for a slot
 *   like it, and choose who to text. Not automatic: a freed slot is
 *   often filled by moving another dog, and a text that went out before
 *   anyone thought about that has already given it away.
 *
 *   CLAIM — the client taps and says yes please. That is a REQUEST, not
 *   a booking, because the same slot is offered to several people and
 *   two of them can tap it. Approving is what decides between them, and
 *   it re-checks the slot is still free before writing an appointment.
 *
 * ## Procedure types
 *
 * `operationalProcedure` for the staff side: putting a client on the
 * list, seeing who is waiting and offering a slot are salon-floor work,
 * and `protectedProcedure` would lock out every restricted staff
 * account. Each re-checks the tenant.
 *
 * `publicProcedure` for the two the client touches, which are reached by
 * a token and nothing else.
 */
import { z } from "zod";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, operationalProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import {
  clients, pets, staff, tenants, appointments,
  waitlistEntries, waitlistOffers, smsLogs,
} from "../../drizzle/schema";
import { requireApprovedStaffTenant } from "../staffAccess";
import { sendSms } from "../sms";
import { getAppBaseUrl } from "../appUrl";
import { nanoid } from "nanoid";
import { departedBookingMessage } from "@shared/petBookable";
import { brisbaneDateKey } from "@shared/localDateTime";
import { properName } from "@shared/personName";
import {
  MAX_ACTIVE_ENTRIES_PER_CLIENT,
  MAX_WAITLIST_WINDOW_DAYS,
  createWaitlistToken, hashWaitlistToken, matchesSlot, offerState,
  rankMatches, waitlistOfferSms, waitlistOfferUrl, windowLengthDays,
} from "@shared/waitlist";

const DATE_KEY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Clients may only add themselves where the salon has switched it on. */
async function requireWaitlistSignupEnabled(db: any, tenantId: number) {
  const [row] = await db.select({ enabled: tenants.waitlistSignupEnabled })
    .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!row?.enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Our online waitlist isn't open just now. Please give us a call and we'll add you.",
    });
  }
}

async function assertTenant(db: any, ctx: any, tenantId: number) {
  const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
  if (portalStaff && portalStaff.tenantId !== tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This salon is not available to your staff profile" });
  }
}

/** Minutes from Brisbane midnight, for matching against a time-of-day preference. */
function brisbaneMinutes(instant: Date): number {
  const hhmm = instant.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Australia/Brisbane",
  });
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "Wed 4 Nov, 9:30am", for the offer text and the client's page. */
function whenLabel(instant: Date): string {
  return instant.toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane",
  });
}

export const waitlistRouter = router({
  /** Put a client on the list. Usually typed while they are on the phone. */
  join: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
      petId: z.number(),
      serviceType: z.string().max(40).optional(),
      preferredStaffId: z.number().optional(),
      earliestDate: DATE_KEY,
      latestDate: DATE_KEY,
      timeOfDay: z.enum(["any", "morning", "afternoon"]).default("any"),
      note: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      const length = windowLengthDays(input.earliestDate, input.latestDate);
      if (length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The last date must be on or after the first." });
      }
      if (length > MAX_WAITLIST_WINDOW_DAYS) {
        // Past this it stops being a waitlist entry and becomes a standing
        // order — and the client will be offered slots they long since
        // forgot asking for.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `That window is ${length} days. Keep it to ${MAX_WAITLIST_WINDOW_DAYS} or fewer so offers still make sense when they arrive.`,
        });
      }

      const [pet] = await db.select({ id: pets.id, name: pets.name })
        .from(pets)
        .where(and(eq(pets.id, input.petId), eq(pets.clientId, input.clientId), eq(pets.tenantId, tenantId)))
        .limit(1);
      if (!pet) throw new TRPCError({ code: "BAD_REQUEST", message: "That dog is not on this client's record" });

      const [created] = await db.insert(waitlistEntries).values({
        tenantId, clientId: input.clientId, petId: input.petId,
        serviceType: input.serviceType ?? null,
        preferredStaffId: input.preferredStaffId ?? null,
        earliestDate: input.earliestDate, latestDate: input.latestDate,
        timeOfDay: input.timeOfDay, note: input.note || null,
        createdByUserId: ctx.user.id,
      });
      return { entryId: (created as any).insertId as number, petName: pet.name };
    }),


  /**
   * Whether a client may add themselves, and who they can ask for.
   *
   * Its own switch, not the membership or online-booking one: asking to
   * be told when something comes up takes no slot and moves no money,
   * but it does create a client record from a public form.
   */
  publicOptions: publicProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await requireWaitlistSignupEnabled(db, tenantId);

      const groomers = await db.select({ id: staff.id, name: staff.name })
        .from(staff)
        .where(and(eq(staff.tenantId, tenantId), eq(staff.isActive, true), eq(staff.onlineBookable, true)))
        .orderBy(asc(staff.name));

      return { groomers, maxWindowDays: MAX_WAITLIST_WINDOW_DAYS };
    }),

  /**
   * A client putting themselves on the list.
   *
   * Creates nothing a staff member would not have created on the phone:
   * the client record if they are new, the dog if it is not on file, and
   * one entry. No slot is held and nothing is charged — the salon still
   * chooses who to offer a freed slot to.
   */
  publicJoin: publicProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(6).max(30),
      email: z.string().trim().email().max(320).optional().or(z.literal("")),
      petName: z.string().trim().min(1).max(100),
      breed: z.string().trim().max(100).optional(),
      preferredStaffId: z.number().optional(),
      earliestDate: DATE_KEY,
      latestDate: DATE_KEY,
      timeOfDay: z.enum(["any", "morning", "afternoon"]).default("any"),
      note: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await requireWaitlistSignupEnabled(db, tenantId);

      const length = windowLengthDays(input.earliestDate, input.latestDate);
      if (length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The last date must be on or after the first." });
      }
      if (length > MAX_WAITLIST_WINDOW_DAYS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Please keep the dates within ${MAX_WAITLIST_WINDOW_DAYS} days so we can still offer you something useful.`,
        });
      }

      if (input.preferredStaffId !== undefined) {
        const [groomer] = await db.select({ id: staff.id }).from(staff).where(and(
          eq(staff.id, input.preferredStaffId), eq(staff.tenantId, tenantId),
          eq(staff.isActive, true), eq(staff.onlineBookable, true),
        )).limit(1);
        if (!groomer) throw new TRPCError({ code: "BAD_REQUEST", message: "That groomer is not available at this salon" });
      }

      // Same identity rule as guest booking and membership sign-up: a
      // client the salon already knows must not become a second record.
      const email = input.email?.trim().toLowerCase() || null;
      const identity = email ? or(eq(clients.email, email), eq(clients.phone, input.phone)) : eq(clients.phone, input.phone);
      let [client] = await db.select({ id: clients.id }).from(clients)
        .where(and(eq(clients.tenantId, tenantId), identity)).limit(1);
      if (!client) {
        const [created] = await db.insert(clients).values({
          tenantId, ...properName(input),
          phone: input.phone, email, status: "active",
        });
        client = { id: (created as any).insertId as number };
      }

      const [existingPet] = await db.select({ id: pets.id }).from(pets).where(and(
        eq(pets.tenantId, tenantId), eq(pets.clientId, client.id), eq(pets.name, input.petName),
      )).limit(1);
      let petId = existingPet?.id;
      if (!petId) {
        const [createdPet] = await db.insert(pets).values({
          tenantId, clientId: client.id, name: input.petName, breed: input.breed || null,
        });
        petId = (createdPet as any).insertId as number;
      }

      const active = await db.select({ id: waitlistEntries.id, petId: waitlistEntries.petId })
        .from(waitlistEntries)
        .where(and(
          eq(waitlistEntries.tenantId, tenantId),
          eq(waitlistEntries.clientId, client.id),
          eq(waitlistEntries.status, "active"),
        ));

      // Submitting the form twice is the normal way this happens, not
      // abuse — a client who taps back and resubmits should not end up
      // on the list twice for the same dog.
      if (active.some((row: any) => row.petId === petId)) {
        return { ok: true as const, alreadyOn: true, petName: input.petName };
      }
      if (active.length >= MAX_ACTIVE_ENTRIES_PER_CLIENT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You're already on the waitlist for ${active.length} dogs. Please call us to add another.`,
        });
      }

      await db.insert(waitlistEntries).values({
        tenantId, clientId: client.id, petId,
        preferredStaffId: input.preferredStaffId ?? null,
        earliestDate: input.earliestDate, latestDate: input.latestDate,
        timeOfDay: input.timeOfDay, note: input.note || null,
        // Null: nobody on the salon side put them here.
        createdByUserId: null,
      });

      return { ok: true as const, alreadyOn: false, petName: input.petName };
    }),

  /** Everyone currently waiting, longest first. */
  listEntries: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number().optional(),
      status: z.enum(["active", "fulfilled", "cancelled", "expired"]).default("active"),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      return db.select({
        id: waitlistEntries.id,
        clientId: waitlistEntries.clientId,
        clientName: sql<string>`CONCAT(${clients.firstName}, ' ', ${clients.lastName})`,
        clientPhone: clients.phone,
        petId: waitlistEntries.petId,
        petName: pets.name,
        serviceType: waitlistEntries.serviceType,
        preferredStaffId: waitlistEntries.preferredStaffId,
        preferredStaffName: staff.name,
        earliestDate: waitlistEntries.earliestDate,
        latestDate: waitlistEntries.latestDate,
        timeOfDay: waitlistEntries.timeOfDay,
        note: waitlistEntries.note,
        status: waitlistEntries.status,
        createdAt: waitlistEntries.createdAt,
      })
        .from(waitlistEntries)
        .innerJoin(clients, eq(waitlistEntries.clientId, clients.id))
        .innerJoin(pets, eq(waitlistEntries.petId, pets.id))
        .leftJoin(staff, eq(waitlistEntries.preferredStaffId, staff.id))
        .where(and(
          eq(waitlistEntries.tenantId, tenantId),
          eq(waitlistEntries.status, input.status),
          input.clientId ? eq(waitlistEntries.clientId, input.clientId) : undefined,
        ))
        .orderBy(asc(waitlistEntries.createdAt));
    }),

  /** Take a client off the list. */
  remove: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), entryId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);
      await db.update(waitlistEntries)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(waitlistEntries.id, input.entryId), eq(waitlistEntries.tenantId, tenantId)));
      return { success: true };
    }),

  /**
   * Who was waiting for a slot like this one.
   *
   * Called when a booking is cancelled. Matching happens here rather
   * than in SQL because the rules are a preference ladder, not a filter:
   * a different groomer still matches and is simply ranked lower.
   */
  matchesForSlot: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      staffId: z.number().nullable().optional(),
      scheduledStart: z.coerce.date(),
      serviceType: z.string().max(40).nullable().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      const open = await db.select({
        id: waitlistEntries.id,
        clientId: waitlistEntries.clientId,
        clientName: sql<string>`CONCAT(${clients.firstName}, ' ', ${clients.lastName})`,
        clientPhone: clients.phone,
        petName: pets.name,
        preferredStaffId: waitlistEntries.preferredStaffId,
        preferredStaffName: staff.name,
        earliestDate: waitlistEntries.earliestDate,
        latestDate: waitlistEntries.latestDate,
        timeOfDay: waitlistEntries.timeOfDay,
        serviceType: waitlistEntries.serviceType,
        note: waitlistEntries.note,
        createdAt: waitlistEntries.createdAt,
      })
        .from(waitlistEntries)
        .innerJoin(clients, eq(waitlistEntries.clientId, clients.id))
        .innerJoin(pets, eq(waitlistEntries.petId, pets.id))
        .leftJoin(staff, eq(waitlistEntries.preferredStaffId, staff.id))
        .where(and(
          eq(waitlistEntries.tenantId, tenantId),
          eq(waitlistEntries.status, "active"),
        ));

      const slot = {
        staffId: input.staffId ?? null,
        dateKey: brisbaneDateKey(input.scheduledStart),
        startMinutes: brisbaneMinutes(input.scheduledStart),
        serviceType: input.serviceType ?? null,
      };

      const matched = open
        .map((entry: any) => ({ entry, result: matchesSlot(entry, slot) }))
        .filter((row: any) => row.result.matches)
        .map((row: any) => ({ ...row.entry, exactGroomer: row.result.exactGroomer }));

      return rankMatches(matched);
    }),

  /**
   * Text one or more waiting clients about a freed slot.
   *
   * Several at once is the normal case: a slot two days out offered to
   * one person who is at work goes unfilled. They are all told it is
   * first-come, and the claim they make is a request the salon decides.
   */
  offer: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      entryIds: z.array(z.number()).min(1).max(10),
      staffId: z.number().nullable().optional(),
      scheduledStart: z.coerce.date(),
      durationMinutes: z.number().int().min(15).max(480),
      serviceType: z.string().max(40).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      if (input.scheduledStart.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That slot is in the past." });
      }

      const [salon] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const entries = await db.select({
        id: waitlistEntries.id, clientId: waitlistEntries.clientId,
        phone: clients.phone, petName: pets.name, status: waitlistEntries.status,
      })
        .from(waitlistEntries)
        .innerJoin(clients, eq(waitlistEntries.clientId, clients.id))
        .innerJoin(pets, eq(waitlistEntries.petId, pets.id))
        .where(and(
          eq(waitlistEntries.tenantId, tenantId),
          inArray(waitlistEntries.id, input.entryIds),
        ));

      const label = whenLabel(input.scheduledStart);
      const sent: Array<{ entryId: number; offerId: number; smsSent: boolean; error: string | null }> = [];

      for (const entry of entries) {
        if (entry.status !== "active") continue;
        if (!entry.phone?.trim()) {
          sent.push({ entryId: entry.id, offerId: 0, smsSent: false, error: "No mobile number on file" });
          continue;
        }
        const { token, tokenHash, expiresAt } = createWaitlistToken();
        const [created] = await db.insert(waitlistOffers).values({
          tenantId, entryId: entry.id,
          staffId: input.staffId ?? null,
          scheduledStart: input.scheduledStart,
          durationMinutes: input.durationMinutes,
          serviceType: input.serviceType ?? null,
          tokenHash, offeredByUserId: ctx.user.id, expiresAt,
        });
        const offerId = (created as any).insertId as number;

        const body = waitlistOfferSms({
          salonName: salon?.name ?? "Your groomer",
          petName: entry.petName,
          whenLabel: label,
          url: waitlistOfferUrl(getAppBaseUrl(), token),
        });
        const result = await sendSms(entry.phone, body, { tenantId, trigger: "staff" });
        // Logged either way, so the conversation shows the salon tried
        // and a failure is visible rather than silent.
        await db.insert(smsLogs).values({
          tenantId, clientId: entry.clientId, toNumber: entry.phone, body,
          twilioSid: result.sid, status: result.success ? "sent" : "failed",
          type: "custom", direction: "outbound", errorMessage: result.error,
        });
        sent.push({ entryId: entry.id, offerId, smsSent: result.success, error: result.error ?? null });
      }

      return { offered: sent.length, results: sent, whenLabel: label };
    }),

  /** The client's page, reached by the token in their text. */
  getOffer: publicProcedure
    .input(z.object({ token: z.string().regex(/^[0-9a-f]{32}$/) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [row] = await db.select({
        id: waitlistOffers.id,
        status: waitlistOffers.status,
        expiresAt: waitlistOffers.expiresAt,
        scheduledStart: waitlistOffers.scheduledStart,
        durationMinutes: waitlistOffers.durationMinutes,
        staffName: staff.name,
        petName: pets.name,
        clientFirstName: clients.firstName,
        salonName: tenants.name,
      })
        .from(waitlistOffers)
        .innerJoin(waitlistEntries, eq(waitlistOffers.entryId, waitlistEntries.id))
        .innerJoin(clients, eq(waitlistEntries.clientId, clients.id))
        .innerJoin(pets, eq(waitlistEntries.petId, pets.id))
        .innerJoin(tenants, eq(waitlistOffers.tenantId, tenants.id))
        .leftJoin(staff, eq(waitlistOffers.staffId, staff.id))
        .where(eq(waitlistOffers.tokenHash, hashWaitlistToken(input.token)))
        .limit(1);

      // An unknown token and a dead one read the same, so the page cannot
      // be used to find live offers.
      if (!row) return { ok: false as const, message: "This link is not valid. Please contact the salon." };
      const state = offerState(row);
      if (!state.ok) return { ok: false as const, message: state.message, reason: state.reason };

      return {
        ok: true as const,
        firstName: row.clientFirstName,
        petName: row.petName,
        salonName: row.salonName,
        staffName: row.staffName,
        whenLabel: whenLabel(new Date(row.scheduledStart)),
        durationMinutes: row.durationMinutes,
        expiresAt: row.expiresAt,
      };
    }),

  /** "Yes please." A request, not a booking — see the file header. */
  claim: publicProcedure
    .input(z.object({ token: z.string().regex(/^[0-9a-f]{32}$/) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [offer] = await db.select({
        id: waitlistOffers.id, status: waitlistOffers.status, expiresAt: waitlistOffers.expiresAt,
      }).from(waitlistOffers)
        .where(eq(waitlistOffers.tokenHash, hashWaitlistToken(input.token)))
        .limit(1);
      if (!offer) throw new TRPCError({ code: "NOT_FOUND", message: "This link is not valid. Please contact the salon." });

      const state = offerState(offer);
      if (!state.ok) throw new TRPCError({ code: "BAD_REQUEST", message: state.message });

      // Guarded on `offered`, so two taps in quick succession write once.
      await db.update(waitlistOffers)
        .set({ status: "claimed", claimedAt: new Date() })
        .where(and(eq(waitlistOffers.id, offer.id), eq(waitlistOffers.status, "offered")));

      return { ok: true, message: "Thanks — the salon will confirm shortly." };
    }),

  /** Claims waiting on somebody, newest first. */
  listClaims: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      return db.select({
        offerId: waitlistOffers.id,
        entryId: waitlistOffers.entryId,
        scheduledStart: waitlistOffers.scheduledStart,
        durationMinutes: waitlistOffers.durationMinutes,
        staffId: waitlistOffers.staffId,
        staffName: staff.name,
        serviceType: waitlistOffers.serviceType,
        claimedAt: waitlistOffers.claimedAt,
        clientId: waitlistEntries.clientId,
        clientName: sql<string>`CONCAT(${clients.firstName}, ' ', ${clients.lastName})`,
        petId: waitlistEntries.petId,
        petName: pets.name,
      })
        .from(waitlistOffers)
        .innerJoin(waitlistEntries, eq(waitlistOffers.entryId, waitlistEntries.id))
        .innerJoin(clients, eq(waitlistEntries.clientId, clients.id))
        .innerJoin(pets, eq(waitlistEntries.petId, pets.id))
        .leftJoin(staff, eq(waitlistOffers.staffId, staff.id))
        .where(and(
          eq(waitlistOffers.tenantId, tenantId),
          eq(waitlistOffers.status, "claimed"),
        ))
        .orderBy(desc(waitlistOffers.claimedAt));
    }),

  /**
   * Give the slot to this client.
   *
   * Books the appointment, closes their waitlist entry, and declines
   * every other claim on the same slot — which is the case this whole
   * design exists for, since one slot goes to several people.
   */
  approveClaim: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), offerId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      const [offer] = await db.select({
        id: waitlistOffers.id, entryId: waitlistOffers.entryId, status: waitlistOffers.status,
        staffId: waitlistOffers.staffId, scheduledStart: waitlistOffers.scheduledStart,
        durationMinutes: waitlistOffers.durationMinutes, serviceType: waitlistOffers.serviceType,
        clientId: waitlistEntries.clientId, petId: waitlistEntries.petId,
      })
        .from(waitlistOffers)
        .innerJoin(waitlistEntries, eq(waitlistOffers.entryId, waitlistEntries.id))
        .where(and(eq(waitlistOffers.id, input.offerId), eq(waitlistOffers.tenantId, tenantId)))
        .limit(1);
      if (!offer) throw new TRPCError({ code: "NOT_FOUND", message: "That offer is not available to this salon" });
      if (offer.status !== "claimed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `This offer is ${offer.status}, not waiting on a decision.` });
      }

      const start = new Date(offer.scheduledStart);
      const end = new Date(start.getTime() + offer.durationMinutes * 60_000);

      // The slot was free when it was offered; a day may have passed.
      // Checked again here because this is the moment it gets taken.
      if (offer.staffId) {
        const [clash] = await db.select({ id: appointments.id }).from(appointments).where(and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.staffId, offer.staffId),
          ne(appointments.workflowState, "cancelled"),
          ne(appointments.status, "cancelled"),
          sql`${appointments.scheduledStart} < ${end}`,
          sql`${appointments.scheduledEnd} > ${start}`,
        )).limit(1);
        if (clash) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That time has been booked since the offer went out. Decline this one and offer another slot.",
          });
        }
      }

      /* An offer can sit for days before it is accepted, and the dog can
         be recorded as passed away in between. */
      const [offerPet] = await db.select({ id: pets.id, name: pets.name, status: pets.status })
        .from(pets).where(eq(pets.id, offer.petId)).limit(1);
      const offerDeparted = offerPet ? departedBookingMessage([offerPet]) : null;
      if (offerDeparted) throw new TRPCError({ code: "BAD_REQUEST", message: offerDeparted });

      const [created] = await db.insert(appointments).values({
        tenantId, clientId: offer.clientId, petId: offer.petId,
        staffId: offer.staffId,
        serviceType: (offer.serviceType ?? "classic_groom") as any,
        scheduledStart: start, scheduledEnd: end,
        trackerToken: nanoid(32),
        workflowState: "scheduled", status: "confirmed",
        // Price deliberately unset: a membership dog's groom carries none
        // and a casual one is priced at booking. Staff set it on the card
        // rather than this guessing.
      });
      const appointmentId = (created as any).insertId as number;

      await db.update(waitlistOffers).set({
        status: "approved", appointmentId,
        decidedByUserId: ctx.user.id, decidedAt: new Date(),
      }).where(and(eq(waitlistOffers.id, offer.id), eq(waitlistOffers.status, "claimed")));

      await db.update(waitlistEntries).set({
        status: "fulfilled", fulfilledAppointmentId: appointmentId, updatedAt: new Date(),
      }).where(eq(waitlistEntries.id, offer.entryId));

      // Everyone else offered this exact slot. They tapped "yes please"
      // and would otherwise never hear back.
      const losers = await db.select({
        id: waitlistOffers.id, clientId: waitlistEntries.clientId,
        phone: clients.phone, petName: pets.name, status: waitlistOffers.status,
      })
        .from(waitlistOffers)
        .innerJoin(waitlistEntries, eq(waitlistOffers.entryId, waitlistEntries.id))
        .innerJoin(clients, eq(waitlistEntries.clientId, clients.id))
        .innerJoin(pets, eq(waitlistEntries.petId, pets.id))
        .where(and(
          eq(waitlistOffers.tenantId, tenantId),
          eq(waitlistOffers.scheduledStart, start),
          ne(waitlistOffers.id, offer.id),
          inArray(waitlistOffers.status, ["offered", "claimed"]),
        ));

      let told = 0;
      for (const loser of losers) {
        await db.update(waitlistOffers).set({
          status: "declined", decidedByUserId: ctx.user.id, decidedAt: new Date(),
        }).where(eq(waitlistOffers.id, loser.id));

        // Only the ones who actually asked for it get a text. Telling
        // somebody who never opened the link that they missed out is a
        // message about nothing, and it costs a segment.
        if (loser.status === "claimed" && loser.phone?.trim()) {
          const body = `Sorry — that spot for ${loser.petName} has gone to another client. You're still on the waitlist.`;
          const result = await sendSms(loser.phone, body, { tenantId, trigger: "automated", type: "waitlist_missed" });
          if (!result.blocked) {
            await db.insert(smsLogs).values({
              tenantId, clientId: loser.clientId, toNumber: loser.phone, body,
              twilioSid: result.sid, status: result.success ? "sent" : "failed",
              type: "custom", direction: "outbound", errorMessage: result.error,
            });
            told++;
          }
        }
      }

      return { success: true, appointmentId, declinedOthers: losers.length, toldOthers: told };
    }),

  /** Turn a claim down without giving the slot to anybody. */
  declineClaim: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), offerId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);
      await db.update(waitlistOffers).set({
        status: "declined", decidedByUserId: ctx.user.id, decidedAt: new Date(),
      }).where(and(
        eq(waitlistOffers.id, input.offerId),
        eq(waitlistOffers.tenantId, tenantId),
        inArray(waitlistOffers.status, ["offered", "claimed"]),
      ));
      return { success: true };
    }),
});
