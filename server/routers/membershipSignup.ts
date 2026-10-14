/**
 * Clients joining a membership themselves.
 *
 * The public half takes the request; the staff half decides it. Nothing in
 * between — no charge, no appointment, no membership row — because the
 * three things a client does here are the three a salon most wants to see
 * before they take effect: a weight that picks the price band, a card that
 * will be billed weekly, and a year of slots in somebody's diary.
 *
 * So `submit` records what was asked for and rings the bell. `approve` is
 * where a membership exists, where Stripe starts and where the calendar
 * fills. A client who mistypes 20 kg as 10 kg is caught by a person
 * looking at the dog's name and thinking "that's not a 10 kg dog", which
 * no validation rule will ever do.
 *
 * ## Procedure types
 *
 * The public ones are `publicProcedure` and gated on the salon's own
 * online-booking switch, the same gate the guest booking path uses: a
 * salon that has not turned online booking on has not agreed to take
 * sign-ups from strangers either.
 *
 * The staff ones are `adminProcedure`, matching routers/stripeCards.ts.
 * Approving starts a recurring card charge, which is an owner decision,
 * and `protectedProcedure` would be too wide — it admits any non-staff
 * account. A groomer must not be able to approve a membership.
 */
import { z } from "zod";
import { and, asc, desc, eq, gt, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import {
  clients, pets, staff, tenants, appointments, memberships, membershipPlans,
  membershipSignupRequests, membershipSignupRequestPets, systemNotifications,
  staffBlockouts as staffBlockoutsTable,
} from "../../drizzle/schema";
import { nanoid } from "nanoid";
import { MEMBERSHIP_PACKAGES } from "@shared/membershipPackages";
import {
  MAX_SIGNUP_DOGS, quoteMembershipSignup, signupPackagesForWeight,
  type SignupDogInput,
} from "@shared/membershipSignup";
import {
  planMembershipSeries, occurrencesForMonths, describeSeriesPlan,
  type BusyInterval,
} from "@shared/membershipSeries";
import { buildOnlineBookingSlotStarts } from "@shared/onlineBookingSlots";
import { getAutoDurationMinutesForPets } from "@shared/appointmentDuration";
import { blockoutBusyInterval } from "@shared/staffBlockouts";
import { startMembershipSubscription, createCardSetupLink } from "../stripeCards";

/** How far ahead a sign-up books. Andy's ask: a client sees their year. */
const DEFAULT_MONTHS_AHEAD = 12;

/** A membership groom still needs a length; fall back when nothing derives one. */
const FALLBACK_DURATION_MINUTES = 90;

const dogInput = z.object({
  name: z.string().trim().min(1).max(100),
  breed: z.string().trim().max(100).optional(),
  weightKg: z.coerce.number().min(0).max(80),
  packageId: z.string().trim().min(1).max(64),
});

/** The salon's own plans, which is where a five-weekly membership lives. */
async function activePlans(db: any, tenantId: number) {
  return db.select().from(membershipPlans).where(and(
    eq(membershipPlans.tenantId, tenantId),
    eq(membershipPlans.isActive, true),
  )).orderBy(asc(membershipPlans.sortOrder));
}

/**
 * Its own switch, not the online-booking one.
 *
 * Sharing a flag looked tidy and was wrong. Public online booking opens
 * every free slot to anybody who finds the page; membership sign-up is a
 * link the salon sends to a particular client. Barkin' Beautiful has
 * online booking OFF and wants the second thing, so the shared switch
 * made this unreachable for the salon that asked for it.
 */
async function requireSignupEnabled(db: any, tenantId: number) {
  const [row] = await db.select({ enabled: tenants.membershipSignupEnabled })
    .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!row?.enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Online sign-up is not switched on for this salon. Please call us and we'll set it up for you.",
    });
  }
}

/** The service a membership's grooms are booked as. */
function serviceTypeFor(membershipServiceType: string): "classic_groom" | "styled_groom" {
  return membershipServiceType === "styled" ? "styled_groom" : "classic_groom";
}

/**
 * Everything stopping this groomer taking a booking between two instants:
 * appointments already in the diary, and leave.
 *
 * One query each, for the whole year, rather than a lookup per occurrence.
 * Twenty occurrences times a nine-day search window is a lot of round
 * trips to answer a question the calendar can answer once.
 */
async function busyFor(db: any, tenantId: number, staffId: number, from: Date, to: Date): Promise<BusyInterval[]> {
  const booked = await db.select({
    start: appointments.scheduledStart,
    end: appointments.scheduledEnd,
  }).from(appointments).where(and(
    eq(appointments.tenantId, tenantId),
    eq(appointments.staffId, staffId),
    ne(appointments.workflowState, "cancelled"),
    ne(appointments.status, "cancelled"),
    lt(appointments.scheduledStart, to),
    gt(appointments.scheduledEnd, from),
  ));

  const leave = await db.select({
    staffId: staffBlockoutsTable.staffId,
    blockoutDate: staffBlockoutsTable.blockoutDate,
    isFullDay: staffBlockoutsTable.isFullDay,
    startTime: staffBlockoutsTable.startTime,
    endTime: staffBlockoutsTable.endTime,
  }).from(staffBlockoutsTable).where(and(
    eq(staffBlockoutsTable.tenantId, tenantId),
    eq(staffBlockoutsTable.staffId, staffId),
    // A day either side, because a blockout row is a date label at
    // midnight UTC and the Brisbane day it means straddles two of them.
    gte(staffBlockoutsTable.blockoutDate, new Date(from.getTime() - 86_400_000)),
    lt(staffBlockoutsTable.blockoutDate, new Date(to.getTime() + 86_400_000)),
  ));

  return [
    ...booked.map((row: any) => ({ start: row.start, end: row.end })),
    ...leave.map(blockoutBusyInterval),
  ];
}

/** The request, its dogs, and the client — everything a decision needs. */
async function loadRequest(db: any, tenantId: number, requestId: number) {
  const [request] = await db.select().from(membershipSignupRequests).where(and(
    eq(membershipSignupRequests.id, requestId),
    eq(membershipSignupRequests.tenantId, tenantId),
  )).limit(1);
  if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "That sign-up request is not available to this salon" });

  const lines = await db.select().from(membershipSignupRequestPets)
    .where(and(
      eq(membershipSignupRequestPets.requestId, requestId),
      eq(membershipSignupRequestPets.tenantId, tenantId),
    ))
    .orderBy(asc(membershipSignupRequestPets.id));

  return { request, lines };
}

export const membershipSignupRouter = router({
  /** Who a client can ask for, and whether they can ask at all. */
  getOptions: publicProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await requireSignupEnabled(db, tenantId);

      // The SAME filter listGroomerProfiles uses, not a guess at it.
      // Filtering "not a receptionist" by hand offered a client every
      // bather and both managers — twelve names where the salon means
      // five. staff.onlineBookable is the flag the salon already
      // maintains for exactly this question, and it is per person rather
      // than per role, so a bather who does take grooms can be offered.
      const groomers = await db.select({ id: staff.id, name: staff.name, photoUrl: staff.onlineProfilePhotoUrl })
        .from(staff)
        .where(and(
          eq(staff.tenantId, tenantId),
          eq(staff.isActive, true),
          eq(staff.onlineBookable, true),
        ))
        .orderBy(asc(staff.name));

      return {
        groomers,
        maxDogs: MAX_SIGNUP_DOGS,
        monthsAhead: DEFAULT_MONTHS_AHEAD,
      };
    }),

  /** What a dog of this weight may be offered, salon's own plans first. */
  packagesForWeight: publicProcedure
    .input(z.object({ tenantId: z.number().default(1), weightKg: z.coerce.number().min(0).max(80) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await requireSignupEnabled(db, tenantId);
      return signupPackagesForWeight(input.weightKg, MEMBERSHIP_PACKAGES, await activePlans(db, tenantId));
    }),

  /**
   * The running total while they fill the form.
   *
   * The same function the submit path uses, so the figure on the screen
   * and the figure that gets recorded cannot drift apart.
   */
  quote: publicProcedure
    .input(z.object({ tenantId: z.number().default(1), dogs: z.array(dogInput).max(MAX_SIGNUP_DOGS) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await requireSignupEnabled(db, tenantId);
      return quoteMembershipSignup({
        dogs: input.dogs as SignupDogInput[],
        builtIns: MEMBERSHIP_PACKAGES,
        plans: await activePlans(db, tenantId),
      });
    }),

  /**
   * Record the request. Charges nothing, books nothing.
   *
   * The client and their dogs become real rows here — they have given the
   * salon their details and should be visible — but the membership waits.
   */
  submit: publicProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(6).max(30),
      email: z.string().trim().email().max(320).optional().or(z.literal("")),
      dogs: z.array(dogInput).min(1).max(MAX_SIGNUP_DOGS),
      staffId: z.number().optional(),
      scheduledStart: z.coerce.date(),
      note: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await requireSignupEnabled(db, tenantId);

      // Price and eligibility are settled server-side. The list the form
      // picked from was built in a browser.
      const quote = quoteMembershipSignup({
        dogs: input.dogs as SignupDogInput[],
        builtIns: MEMBERSHIP_PACKAGES,
        plans: await activePlans(db, tenantId),
      });
      if (!quote.ok) throw new TRPCError({ code: "BAD_REQUEST", message: quote.problems.join(" ") });

      if (input.scheduledStart.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a first appointment in the future." });
      }
      if (input.staffId !== undefined) {
        const [groomer] = await db.select({ id: staff.id }).from(staff)
          .where(and(eq(staff.id, input.staffId), eq(staff.tenantId, tenantId), eq(staff.isActive, true)))
          .limit(1);
        if (!groomer) throw new TRPCError({ code: "BAD_REQUEST", message: "That groomer is not available at this salon" });
      }

      // Same identity rule the guest booking path uses: a client who has
      // been to the salon before must not become a second record.
      const email = input.email?.trim().toLowerCase() || null;
      const identity = email ? or(eq(clients.email, email), eq(clients.phone, input.phone)) : eq(clients.phone, input.phone);
      let [client] = await db.select({ id: clients.id }).from(clients)
        .where(and(eq(clients.tenantId, tenantId), identity)).limit(1);
      if (!client) {
        const [created] = await db.insert(clients).values({
          tenantId, firstName: input.firstName, lastName: input.lastName,
          phone: input.phone, email, status: "active",
        });
        client = { id: (created as any).insertId as number };
      }

      const duration = getAutoDurationMinutesForPets(
        serviceTypeFor(quote.lines[0].serviceType),
        quote.lines.map((line) => line.weightKg),
      ) ?? FALLBACK_DURATION_MINUTES;

      const [createdRequest] = await db.insert(membershipSignupRequests).values({
        tenantId, clientId: client.id,
        status: "pending",
        staffId: input.staffId ?? null,
        firstScheduledStart: input.scheduledStart,
        durationMinutes: duration,
        intervalWeeks: quote.intervalWeeks,
        monthsAhead: DEFAULT_MONTHS_AHEAD,
        weeklyTotal: quote.weeklyTotal.toFixed(2),
        clientNote: input.note || null,
      });
      const requestId = (createdRequest as any).insertId as number;

      const petNames: string[] = [];
      for (let index = 0; index < quote.lines.length; index++) {
        const line = quote.lines[index];
        // A dog already on file keeps its row; this client may be an
        // existing customer adding a membership to dogs the salon knows.
        const [existing] = await db.select({ id: pets.id }).from(pets).where(and(
          eq(pets.tenantId, tenantId), eq(pets.clientId, client.id), eq(pets.name, line.petName),
        )).limit(1);
        let petId = existing?.id;
        if (!petId) {
          const [createdPet] = await db.insert(pets).values({
            tenantId, clientId: client.id, name: line.petName,
            breed: input.dogs[index]?.breed || null,
            weightKg: String(line.weightKg), weight: String(line.weightKg),
          });
          petId = (createdPet as any).insertId as number;
        }
        petNames.push(line.petName);

        await db.insert(membershipSignupRequestPets).values({
          requestId, tenantId, petId,
          weightKg: String(line.weightKg),
          packageId: line.packageId, packageName: line.packageName,
          tier: line.tier, serviceType: line.serviceType,
          weeklyPrice: line.weeklyPrice.toFixed(2),
          intervalWeeks: line.appointmentIntervalWeeks,
        });
      }

      // Caught, like every other notification write: a bell row failing
      // must not undo a request the client has already made.
      try {
        const plans = Array.from(new Set(quote.lines.map((l) => l.packageName)));
        await db.insert(systemNotifications).values({
          tenantId, kind: "membership_signup_requested", clientId: client.id,
          detail: `${plans.join(", ")} — $${quote.weeklyTotal.toFixed(2)} a week.`,
        });
      } catch (err) {
        console.error("[membership-signup] could not record a system notification", err);
      }

      // The card is captured now so approval can start billing without
      // chasing the client. Stripe being unconfigured must not lose the
      // request — a staff member can send a card link by hand.
      let cardSetupUrl: string | null = null;
      try {
        cardSetupUrl = (await createCardSetupLink(client.id)).url;
      } catch (err) {
        console.error("[membership-signup] could not create a card setup link", err);
      }

      return { requestId, clientId: client.id, petNames, weeklyTotal: quote.weeklyTotal, cardSetupUrl };
    }),

  /** The queue. Pending first, because that is the one that needs a person. */
  listRequests: adminProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      status: z.enum(["pending", "approved", "declined", "withdrawn"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);

      const rows = await db.select({
        request: membershipSignupRequests,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientPhone: clients.phone,
        clientEmail: clients.email,
        hasCardOnFile: clients.stripeDefaultPaymentMethodId,
        groomerName: staff.name,
      })
        .from(membershipSignupRequests)
        .innerJoin(clients, eq(membershipSignupRequests.clientId, clients.id))
        .leftJoin(staff, eq(membershipSignupRequests.staffId, staff.id))
        .where(and(
          eq(membershipSignupRequests.tenantId, tenantId),
          input.status ? eq(membershipSignupRequests.status, input.status) : undefined,
        ))
        .orderBy(desc(membershipSignupRequests.createdAt));
      if (rows.length === 0) return [];

      const lines = await db.select().from(membershipSignupRequestPets).where(and(
        eq(membershipSignupRequestPets.tenantId, tenantId),
        inArray(membershipSignupRequestPets.requestId, rows.map((r: any) => r.request.id)),
      )).orderBy(asc(membershipSignupRequestPets.id));

      return rows.map((row: any) => ({
        ...row.request,
        clientName: `${row.clientFirstName} ${row.clientLastName}`.trim(),
        clientPhone: row.clientPhone,
        clientEmail: row.clientEmail,
        hasCardOnFile: Boolean(row.hasCardOnFile),
        groomerName: row.groomerName,
        dogs: lines.filter((line: any) => line.requestId === row.request.id),
      }));
    }),

  /**
   * What approving would actually book, worked out against the calendar
   * as it is now.
   *
   * Deliberately not stored at request time: a series planned when the
   * client filled the form is stale by the time anyone opens it, and a
   * staff member approving needs to see the real dates, including the
   * ones that had to move.
   */
  previewSeries: adminProcedure
    .input(z.object({ tenantId: z.number().default(1), requestId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      const { request, lines } = await loadRequest(db, tenantId, input.requestId);

      const plan = await planFor(db, tenantId, request);
      const quote = quoteMembershipSignup({
        dogs: lines.map((line: any) => ({
          name: "x", weightKg: Number(line.weightKg), packageId: line.packageId,
        })),
        builtIns: MEMBERSHIP_PACKAGES,
        plans: await activePlans(db, tenantId),
      });

      return {
        plan,
        summary: describeSeriesPlan(plan),
        /** Null when the catalogue still agrees with what the client was quoted. */
        priceChanged: quote.ok && Math.abs(quote.weeklyTotal - Number(request.weeklyTotal)) > 0.005
          ? { quotedWeekly: Number(request.weeklyTotal), currentWeekly: quote.weeklyTotal }
          : null,
        /** A plan that has since been deactivated or renamed stops approval. */
        catalogueProblems: quote.ok ? [] : quote.problems,
      };
    }),

  /**
   * Make it real: memberships, the year of grooms, then the subscription.
   *
   * That order is not arbitrary. Stripe cannot be rolled back by a
   * database transaction, so the half that can be undone goes first. A
   * membership created with billing that failed to start is visible and
   * fixable from the Memberships screen; a card charged weekly for a
   * membership that does not exist is neither.
   */
  approve: adminProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      requestId: z.number(),
      /** Required when the catalogue price has moved since they asked. */
      acceptPriceChange: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      const { request, lines } = await loadRequest(db, tenantId, input.requestId);

      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `This request has already been ${request.status}.` });
      }
      if (lines.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This request has no dogs on it." });
      }

      const quote = quoteMembershipSignup({
        dogs: lines.map((line: any) => ({
          name: "x", weightKg: Number(line.weightKg), packageId: line.packageId,
        })),
        builtIns: MEMBERSHIP_PACKAGES,
        plans: await activePlans(db, tenantId),
      });
      if (!quote.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `The memberships asked for are no longer available: ${quote.problems.join(" ")}`,
        });
      }
      // The client said yes to a number. If the price list has moved since,
      // somebody has to agree to the new one rather than it going through
      // on the strength of the old screen.
      if (Math.abs(quote.weeklyTotal - Number(request.weeklyTotal)) > 0.005 && !input.acceptPriceChange) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `The weekly price is now $${quote.weeklyTotal.toFixed(2)}, not the $${Number(request.weeklyTotal).toFixed(2)} `
            + `this client was quoted. Approve again to accept the new price, or decline and re-quote them.`,
        });
      }

      const plan = await planFor(db, tenantId, request);
      if (plan.placedCount === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No appointments could be booked at that time. Decline this request and offer the client another slot.",
        });
      }

      const recurringGroupId = nanoid(24);
      const createdMembershipIds: number[] = [];

      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const quoted = quote.lines[index];
        const [created] = await db.insert(memberships).values({
          tenantId, clientId: request.clientId, petId: line.petId,
          name: quoted.packageName,
          tier: quoted.tier as any,
          serviceType: quoted.serviceType as any,
          billingCycleWeeks: 1,
          appointmentIntervalWeeks: quoted.appointmentIntervalWeeks,
          pricePerCycle: quoted.weeklyPrice.toFixed(2),
          // Not active until Stripe says the money is set up. The weekly
          // charge is the membership; a row marked active with no
          // subscription behind it reads as a paying client who is not.
          status: "pending_payment",
          paymentGateway: "stripe",
        });
        const membershipId = (created as any).insertId as number;
        createdMembershipIds.push(membershipId);
        await db.update(membershipSignupRequestPets)
          .set({ membershipId })
          .where(eq(membershipSignupRequestPets.id, line.id));
      }

      const sessionId = lines.length > 1 ? nanoid(16) : null;
      let bookedCount = 0;
      for (const occurrence of plan.occurrences) {
        if (!occurrence.start) continue;
        const end = new Date(occurrence.start.getTime() + request.durationMinutes * 60_000);
        for (let index = 0; index < lines.length; index++) {
          const line = lines[index];
          await db.insert(appointments).values({
            tenantId, clientId: request.clientId, petId: line.petId,
            staffId: request.staffId,
            serviceType: serviceTypeFor(quote.lines[index].serviceType),
            scheduledStart: occurrence.start, scheduledEnd: end,
            // A membership groom carries no price: the weekly payment is
            // the revenue, and a price here would double-count it.
            price: "0.00",
            membershipId: createdMembershipIds[index],
            trackerToken: nanoid(32),
            sessionId,
            workflowState: "scheduled",
            status: "confirmed",
            recurringGroupId,
          });
        }
        bookedCount++;
      }

      await db.update(membershipSignupRequests).set({
        status: "approved",
        decidedByUserId: ctx.user.id,
        decidedAt: new Date(),
        weeklyTotal: quote.weeklyTotal.toFixed(2),
        updatedAt: new Date(),
      }).where(and(
        eq(membershipSignupRequests.id, request.id),
        eq(membershipSignupRequests.tenantId, tenantId),
        // Only from pending: two people approving at once must not bill twice.
        eq(membershipSignupRequests.status, "pending"),
      ));

      // Last, and per membership, because that is the shape
      // startMembershipSubscription already has. Two dogs means two weekly
      // line items on one card, which is how every membership here bills.
      const billingProblems: string[] = [];
      for (const membershipId of createdMembershipIds) {
        try {
          await startMembershipSubscription(membershipId);
        } catch (err) {
          console.error("[membership-signup] subscription did not start", membershipId, err);
          billingProblems.push(err instanceof Error ? err.message : String(err));
        }
      }

      return {
        success: true,
        membershipIds: createdMembershipIds,
        recurringGroupId,
        appointmentsBooked: bookedCount * lines.length,
        visitsBooked: bookedCount,
        plan,
        summary: describeSeriesPlan(plan),
        /**
         * Empty means billing is running. Anything here means the
         * memberships and the diary are right and the card is not —
         * fixable from Memberships, but somebody has to be told.
         */
        billingProblems,
      };
    }),

  decline: adminProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      requestId: z.number(),
      reason: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      const { request } = await loadRequest(db, tenantId, input.requestId);
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `This request has already been ${request.status}.` });
      }

      await db.update(membershipSignupRequests).set({
        status: "declined",
        decidedByUserId: ctx.user.id,
        decidedAt: new Date(),
        decidedReason: input.reason || null,
        updatedAt: new Date(),
      }).where(and(
        eq(membershipSignupRequests.id, request.id),
        eq(membershipSignupRequests.tenantId, tenantId),
        eq(membershipSignupRequests.status, "pending"),
      ));

      // The client and their dogs stay. They are a real enquiry, and
      // deleting them would lose a prospect the salon can still call.
      return { success: true };
    }),
});

/** Plan the year for a request, against the calendar as it stands now. */
async function planFor(db: any, tenantId: number, request: any) {
  const occurrenceCount = occurrencesForMonths(request.intervalWeeks, request.monthsAhead);
  const first = new Date(request.firstScheduledStart);
  const horizonEnd = new Date(first.getTime() + (request.monthsAhead + 1) * 31 * 86_400_000);

  // No groomer asked for means nothing to clash with, so the cadence runs
  // clean and the salon assigns people later. That matches how the diary
  // already treats an unassigned booking.
  const busy = request.staffId
    ? await busyFor(db, tenantId, request.staffId, first, horizonEnd)
    : [];

  return planMembershipSeries({
    firstStart: first,
    durationMinutes: request.durationMinutes,
    intervalWeeks: request.intervalWeeks,
    occurrenceCount,
    busy,
    slotsForDate: buildOnlineBookingSlotStarts,
  });
}
