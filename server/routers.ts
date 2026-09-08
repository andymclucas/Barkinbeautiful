import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, operationalProcedure, publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { authRouter } from "./routers/auth";
import { getDb } from "./db";
import { z } from "zod";
import { eq, and, or, ne, gte, lte, gt, lt, desc, asc, like, sql, inArray } from "drizzle-orm";
import {
  tenants, staff, clients, pets, appointments, workflowLogs,
  memberships, membershipPayments, membershipLedgerEntries, invoices, invoiceLineItems, retailProducts,
  timesheets, petPhotos, migrationJobs, staffBlockouts, groomStyleNotes,
  emailCampaigns, emailCampaignSends, emailUnsubscribes,
  groomingReports, groomStylePresets, familyGroups, smsLogs, users, petMembershipEvents, staffInvitations, staffAccessEvents, clientPortalAccess, workflowTimingReviewThresholds, clientContacts, pricingServices, membershipPlans
} from "../drizzle/schema";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { deriveWorkflowTimingUpdate, type WorkflowState } from "./workflowTiming";
import { BATH_RESOURCE_MINUTES, countOverlappingBookings, countSharedBathResourceOverlaps, isOnlineSlotAvailable } from "./onlineBookingRules";
import { getPetWeightBand, isEligibleOnlineBookingService } from "../shared/onlineBookingWeightEligibility";
import { buildOnlineBookingNotes } from "../shared/onlineBookingPreview";
import { buildOnlineBookingSlotStarts } from "../shared/onlineBookingSlots";
import { getLargeDogCapacityResult, isLargeDogFullGroom } from "../shared/onlineBookingLargeDogCapacity";
import { sendSms, buildAppointmentReminderSms, buildPetTrackerSms, buildReadyForPickupSms, buildMembershipPaymentFailedSms, buildCustomSms } from "./sms";
import { notifyOwner } from "./ownerNotification";
import { calculateGroomIntervalStats } from "./groomInterval";
import { resolveLastAppointmentDates } from "./lastAppointment";
import { resolveAppointmentDeletionIds } from "../shared/appointmentDeletion";
import { consumeAppointmentDeletionUndo, createAppointmentDeletionUndo, getAppointmentDeletionUndo, type AppointmentDeletionSnapshot } from "./appointmentDeletionUndo";
import { getNewSharedSessionPetIds } from "../shared/appointmentSession";
import { getReplacementWeightBand, isEligibleMembershipReplacement } from "../shared/departedPetMembership";
import { getStripePrototypeStatus } from "../shared/stripeMembershipReconciliation";
import { calculateMembershipAccount } from "../shared/membershipAccountsReceivable";
import { createStaffInvitationToken, hashStaffInvitationToken, isLinkedStaffUser, isStaffInvitationExpired } from "../shared/staffInvitation";
import { createInvoiceCheckout } from "./stripePayments";
import { normalizePetAlertLevel } from "../shared/petAlertStatus";
import { createClientPortalToken, hashClientPortalToken, isClientPortalLinkExpired } from "../shared/clientPortalAccess";
import { clearClientPortalSessionCookie, readClientPortalSession, setClientPortalSessionCookie } from "./clientPortalSession";
import { DEFAULT_TIMING_REVIEW_THRESHOLDS, getTimingReviewScopeKey, resolveTimingReviewThreshold, TIMING_REVIEW_SIZE_PRESETS, type TimingReviewThresholdRule } from "../shared/workflowTimingReviewThresholds";
import { getFamilySessionTimeAlignments } from "../shared/familyAppointmentAlignment";
import { resolveAppointmentMembershipCoverage, type AppointmentService } from "../shared/appointmentMembershipCoverage";
import { getMembershipPackageById, getMembershipPackagesForWeight, getMembershipWeightBand, MEMBERSHIP_PACKAGES, MEMBERSHIP_WEIGHT_BANDS } from "../shared/membershipPackages";
import { buildBathPriorityQueue, isBathPriorityMutable } from "../shared/bathPriorityQueue";
import { parseBrisbaneLocalDateTime } from "../shared/localDateTime";
import { getPricingAmountValidationError, normalisePricingCode } from "../shared/pricingCatalogue";

async function requireApprovedStaffTenant(db: any, user: { id: number; role: string }) {
  if (user.role === "admin") return null;
  if (user.role !== "staff") throw new Error("Only approved staff can access salon operations");
  const [portalStaff] = await db.select({ id: staff.id, tenantId: staff.tenantId, role: staff.role, portalStatus: staff.portalStatus })
    .from(staff).where(eq(staff.userId, user.id)).limit(1);
  if (!portalStaff || portalStaff.portalStatus !== "approved") {
    throw new Error("Your staff access is awaiting administrator approval");
  }
  return portalStaff;
}

async function requireApprovedFamilyLinkStaff(db: any, user: { id: number; role: string }) {
  const portalStaff = await requireApprovedStaffTenant(db, user);
  if (!portalStaff) return null;
  if (portalStaff.role !== "groomer" && portalStaff.role !== "bather") {
    throw new Error("Only approved Groomers and Bathers can create family links from Workflow");
  }
  return portalStaff;
}

async function requireApprovedStaffAppointmentAccess(db: any, user: { id: number; role: string }, appointmentId: number, expectedPetId?: number) {
  const portalStaff = await requireApprovedStaffTenant(db, user);
  if (!portalStaff) return null;
  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!appointment || appointment.tenantId !== portalStaff.tenantId || (expectedPetId !== undefined && appointment.petId !== expectedPetId)) {
    throw new Error("This appointment is not available to your salon staff profile");
  }
  return portalStaff;
}

async function requireApprovedStaffPetAccess(db: any, user: { id: number; role: string }, petId: number) {
  const portalStaff = await requireApprovedStaffTenant(db, user);
  if (!portalStaff) return null;
  const [pet] = await db.select({ id: pets.id, tenantId: pets.tenantId }).from(pets).where(eq(pets.id, petId)).limit(1);
  if (!pet || pet.tenantId !== portalStaff.tenantId) {
    throw new Error("This pet is not available to your salon staff profile");
  }
  return portalStaff;
}

async function recordStaffAccessEvent(db: any, event: Omit<typeof staffAccessEvents.$inferInsert, "occurredAtMs" | "createdAt">) {
  const occurredAtMs = Date.now();
  await db.insert(staffAccessEvents).values({ ...event, occurredAtMs, createdAt: new Date(occurredAtMs) });
  return occurredAtMs;
}

async function getAppointmentMembershipCoverage(db: any, tenantId: number, clientId: number, petIds: number[], serviceType: AppointmentService) {
  const activeMemberships = await db.select({
    id: memberships.id,
    petId: memberships.petId,
    name: memberships.name,
    tier: memberships.tier,
    serviceType: memberships.serviceType,
    status: memberships.status,
    bookingSuspended: memberships.bookingSuspended,
  }).from(memberships).where(and(
    eq(memberships.tenantId, tenantId),
    eq(memberships.clientId, clientId),
    inArray(memberships.petId, Array.from(new Set(petIds))),
  ));
  return resolveAppointmentMembershipCoverage(petIds, serviceType, activeMemberships);
}

// ─── Calendar / Appointments ──────────────────────────────────────────────────
const calendarRouter = router({
  searchAppointments: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      query: z.string().min(1),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (ctx.user.role === "staff") {
        const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
        if (portalStaff && portalStaff.tenantId !== input.tenantId) {
          throw new Error("This calendar is not available to your salon staff profile");
        }
      }
      const term = `%${input.query.trim()}%`;
      const rows = await db
        .select({
          id: appointments.id,
          scheduledStart: appointments.scheduledStart,
          scheduledEnd: appointments.scheduledEnd,
          workflowState: appointments.workflowState,
          status: appointments.status,
          serviceType: appointments.serviceType,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          petName: pets.name,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(clients, eq(appointments.clientId, clients.id))
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          sql`${pets.name} LIKE ${term} OR ${clients.firstName} LIKE ${term} OR ${clients.lastName} LIKE ${term} OR CONCAT(${clients.firstName}, ' ', ${clients.lastName}) LIKE ${term}`,
        ))
        .orderBy(desc(appointments.scheduledStart))
        .limit(50);
      return rows;
    }),

  getAppointments: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [
        eq(appointments.tenantId, input.tenantId),
        gte(appointments.scheduledStart, new Date(input.dateFrom)),
        lte(appointments.scheduledStart, new Date(input.dateTo)),
      ];
      if (ctx.user.role === "staff") {
        const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
        if (portalStaff && portalStaff.tenantId !== input.tenantId) {
          throw new Error("This calendar is not available to your salon staff profile");
        }
      }
      const rows = await db
        .select({
          id: appointments.id,
          scheduledStart: appointments.scheduledStart,
          scheduledEnd: appointments.scheduledEnd,
          workflowState: appointments.workflowState,
          status: appointments.status,
          serviceType: appointments.serviceType,
          notes: appointments.notes,
          price: appointments.price,
          trackerToken: appointments.trackerToken,
          staffId: appointments.staffId,
          clientId: appointments.clientId,
          petId: appointments.petId,
          membershipId: appointments.membershipId,
          sessionId: appointments.sessionId,
          reminderSentAt: appointments.reminderSentAt,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientPhone: clients.phone,
          clientEmail: clients.email,
          petName: pets.name,
          petBreed: pets.breed,
          staffName: staff.name,
          staffColour: staff.colourHex,
        })
        .from(appointments)
        .leftJoin(clients, eq(appointments.clientId, clients.id))
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(and(...conditions))
        .orderBy(asc(appointments.scheduledStart));

      const appointmentIds = rows.map(r => r.id);
      const reminderStatusByAppointment: Record<number, string> = {};
      if (appointmentIds.length > 0) {
        const reminderLogs = await db
          .select({ appointmentId: smsLogs.appointmentId, status: smsLogs.status })
          .from(smsLogs)
          .where(and(
            inArray(smsLogs.appointmentId, appointmentIds),
            eq(smsLogs.type, "reminder"),
            eq(smsLogs.direction, "outbound")
          ))
          .orderBy(desc(smsLogs.sentAt));
        for (const log of reminderLogs) {
          if (log.appointmentId && !reminderStatusByAppointment[log.appointmentId]) {
            reminderStatusByAppointment[log.appointmentId] = log.status;
          }
        }
      }

      // Enrich each appointment with the pet's next future appointment date
      const now = new Date();
      const petIds = Array.from(new Set(rows.map(r => r.petId).filter((id): id is number => id !== null)));
      const nextApptMap: Record<number, Date | null> = {};
      const lastAppointmentMap: Record<number, Date> = {};
      if (petIds.length > 0) {
        const nextAppts = await db
          .select({ petId: appointments.petId, scheduledStart: appointments.scheduledStart })
          .from(appointments)
          .where(and(
            inArray(appointments.petId, petIds),
            gt(appointments.scheduledStart, now),
            eq(appointments.tenantId, input.tenantId)
          ))
          .orderBy(asc(appointments.scheduledStart));
        for (const na of nextAppts) {
          if (na.petId !== null && !nextApptMap[na.petId]) {
            nextApptMap[na.petId] = na.scheduledStart;
          }
        }

        const priorAppointments = await db
          .select({ petId: appointments.petId, scheduledStart: appointments.scheduledStart, status: appointments.status })
          .from(appointments)
          .where(and(
            inArray(appointments.petId, petIds),
            lt(appointments.scheduledStart, now),
            eq(appointments.tenantId, input.tenantId)
          ))
          .orderBy(desc(appointments.scheduledStart));
        Object.assign(lastAppointmentMap, resolveLastAppointmentDates(priorAppointments));
      }

      return rows.map(r => ({
        ...r,
        nextAppointmentDate: r.petId !== null ? (nextApptMap[r.petId] ?? null) : null,
        lastAppointmentDate: r.petId !== null ? (lastAppointmentMap[r.petId] ?? null) : null,
        reminderStatus: reminderStatusByAppointment[r.id] ?? (r.reminderSentAt ? "sent" : null),
      }));
    }),

  createAppointment: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
      petId: z.number(),
      staffId: z.number().optional(),
      serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "other"]).default("classic_groom"),
      scheduledStart: z.string(),
      scheduledEnd: z.string(),
      notes: z.string().optional(),
      price: z.string().optional(),
      membershipId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This salon is not available to your staff profile");
      const [pet] = await db.select({ id: pets.id, clientId: pets.clientId, tenantId: pets.tenantId })
        .from(pets).where(eq(pets.id, input.petId)).limit(1);
      if (!pet || pet.clientId !== input.clientId || pet.tenantId !== input.tenantId) {
        throw new Error("The selected client and pet are not available to this salon");
      }
      const coverage = await getAppointmentMembershipCoverage(db, input.tenantId, input.clientId, [input.petId], input.serviceType);
      const coveredMembership = coverage.membershipByPetId[input.petId] ?? null;
      const token = nanoid(32);
      await db.insert(appointments).values({
        tenantId: input.tenantId,
        clientId: input.clientId,
        petId: input.petId,
        staffId: input.staffId,
        serviceType: input.serviceType,
        scheduledStart: parseBrisbaneLocalDateTime(input.scheduledStart),
        scheduledEnd: parseBrisbaneLocalDateTime(input.scheduledEnd),
        notes: input.notes,
        price: coverage.fullyCovered ? "0.00" : input.price,
        membershipId: coveredMembership?.id ?? null,
        trackerToken: token,
        workflowState: "scheduled",
        status: "confirmed",
      });
      return { success: true, trackerToken: token, membershipCovered: coverage.fullyCovered };
    }),

  createMultiPetAppointment: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
      petIds: z.array(z.number()).min(1),
      staffId: z.number().optional(),
      serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]).default("classic_groom"),
      scheduledStart: z.string(),
      scheduledEnd: z.string(),
      notes: z.string().optional(),
      price: z.string().optional(),
      membershipId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This salon is not available to your staff profile");
      const petIds = Array.from(new Set(input.petIds));
      const selectedPets = await db.select({ id: pets.id, clientId: pets.clientId, tenantId: pets.tenantId })
        .from(pets).where(inArray(pets.id, petIds));
      if (selectedPets.length !== petIds.length || selectedPets.some(pet => pet.clientId !== input.clientId || pet.tenantId !== input.tenantId)) {
        throw new Error("The selected client and pets are not available to this salon");
      }
      const coverage = await getAppointmentMembershipCoverage(db, input.tenantId, input.clientId, petIds, input.serviceType);
      // Assign a shared sessionId when booking multiple pets together
      const sessionId = petIds.length > 1 ? nanoid(16) : null;
      const created: number[] = [];
      for (const petId of petIds) {
        const token = nanoid(32);
        await db.insert(appointments).values({
          tenantId: input.tenantId,
          clientId: input.clientId,
          petId,
          staffId: input.staffId,
          serviceType: input.serviceType,
          scheduledStart: parseBrisbaneLocalDateTime(input.scheduledStart),
          scheduledEnd: parseBrisbaneLocalDateTime(input.scheduledEnd),
          notes: input.notes,
          price: coverage.fullyCovered ? "0.00" : input.price,
          membershipId: coverage.membershipByPetId[petId]?.id ?? null,
          trackerToken: token,
          sessionId,
          workflowState: "scheduled",
          status: "confirmed",
        });
        created.push(petId);
      }
      return { success: true, created: created.length, membershipCovered: coverage.fullyCovered };
    }),

  getMembershipCoverage: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
      petIds: z.array(z.number()).min(1),
      serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This salon is not available to your staff profile");
      const petIds = Array.from(new Set(input.petIds));
      const selectedPets = await db.select({ id: pets.id, clientId: pets.clientId, tenantId: pets.tenantId })
        .from(pets).where(inArray(pets.id, petIds));
      if (selectedPets.length !== petIds.length || selectedPets.some(pet => pet.clientId !== input.clientId || pet.tenantId !== input.tenantId)) {
        throw new Error("The selected client and pets are not available to this salon");
      }
      const coverage = await getAppointmentMembershipCoverage(db, input.tenantId, input.clientId, petIds, input.serviceType);
      return {
        ...coverage,
        memberships: Object.values(coverage.membershipByPetId).map(membership => ({
          id: membership.id,
          petId: membership.petId,
          name: membership.name,
          tier: membership.tier,
        })),
      };
    }),

  getClientMembershipSummary: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This salon is not available to your staff profile");
      const [client] = await db.select({ id: clients.id, tenantId: clients.tenantId })
        .from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client || client.tenantId !== input.tenantId) throw new Error("This client is not available to this salon");
      const clientMemberships = await db.select({
        id: memberships.id,
        petId: memberships.petId,
        name: memberships.name,
        tier: memberships.tier,
        serviceType: memberships.serviceType,
        status: memberships.status,
        bookingSuspended: memberships.bookingSuspended,
      }).from(memberships).where(and(
        eq(memberships.tenantId, input.tenantId),
        eq(memberships.clientId, input.clientId),
        eq(memberships.status, "active"),
      )).orderBy(asc(memberships.name));
      return {
        activeMemberships: clientMemberships,
        activeCount: clientMemberships.length,
        coveredPetIds: clientMemberships.filter((membership) => !membership.bookingSuspended).map((membership) => membership.petId),
        suspendedPetIds: clientMemberships.filter((membership) => membership.bookingSuspended).map((membership) => membership.petId),
      };
    }),

  addPetsToSharedAppointment: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      petIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [source] = await db.select().from(appointments).where(eq(appointments.id, input.appointmentId)).limit(1);
      if (!source) throw new Error("Appointment not found");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, source.id);
      if (source.status === "cancelled" || source.status === "no_show") {
        throw new Error("A cancelled or no-show booking cannot be expanded with additional pets");
      }

      const requestedPetIds = Array.from(new Set(input.petIds));
      const eligiblePets = await db.select({ id: pets.id }).from(pets).where(and(
        eq(pets.tenantId, source.tenantId),
        eq(pets.clientId, source.clientId),
        inArray(pets.id, requestedPetIds),
        eq(pets.status, "active"),
      ));
      if (eligiblePets.length !== requestedPetIds.length) {
        throw new Error("Every added pet must be an active pet belonging to the same client");
      }

      const existingSessionPets = source.sessionId
        ? await db.select({ petId: appointments.petId }).from(appointments).where(and(
            eq(appointments.tenantId, source.tenantId),
            eq(appointments.sessionId, source.sessionId),
          ))
        : [{ petId: source.petId }];
      const petIdsToAdd = getNewSharedSessionPetIds(
        existingSessionPets.map((row) => row.petId),
        requestedPetIds,
      );
      if (petIdsToAdd.length === 0) return { success: true, added: 0 };

      const sessionId = source.sessionId ?? nanoid(16);
      if (!source.sessionId) {
        await db.update(appointments).set({ sessionId }).where(eq(appointments.id, source.id));
      }
      await db.insert(appointments).values(petIdsToAdd.map((petId) => ({
        tenantId: source.tenantId,
        clientId: source.clientId,
        petId,
        staffId: source.staffId,
        serviceType: source.serviceType,
        scheduledStart: source.scheduledStart,
        scheduledEnd: source.scheduledEnd,
        notes: source.notes,
        // The existing line may contain a total package price. Do not invent or duplicate a per-pet charge.
        price: null,
        membershipId: null,
        trackerToken: nanoid(32),
        sessionId,
        workflowState: source.workflowState,
        status: source.status,
      })));
      return { success: true, added: petIdsToAdd.length };
    }),

  updateWorkflowState: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      newState: z.enum(["scheduled", "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready", "complete", "cancelled", "no_show"]),
      staffId: z.number().optional(),
      estimatedPickupAt: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [appt] = await db.select().from(appointments).where(eq(appointments.id, input.appointmentId)).limit(1);
      if (!appt) throw new Error("Appointment not found");
      const portalStaff = await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);
      const isTerminal = input.newState === "cancelled" || input.newState === "no_show";
      const nextStatus: "confirmed" | "pending" | "cancelled" | "no_show" = isTerminal
        ? (input.newState as "cancelled" | "no_show")
        : (appt.status === "pending" ? "pending" : "confirmed");
      const now = Date.now();
      const timingUpdates = deriveWorkflowTimingUpdate(appt as WorkflowState extends never ? never : any, input.newState as WorkflowState, now);
      await db.update(appointments).set({
        workflowState: input.newState,
        status: nextStatus,
        estimatedPickupAt: input.estimatedPickupAt ? new Date(input.estimatedPickupAt) : undefined,
        actualStart: input.newState === "checked_in" ? new Date(now) : appt.actualStart,
        actualEnd: input.newState === "complete" ? new Date(now) : appt.workflowState === "complete" ? null : appt.actualEnd,
        ...timingUpdates,
      }).where(eq(appointments.id, input.appointmentId));
      await db.insert(workflowLogs).values({
        appointmentId: input.appointmentId,
        fromState: appt.workflowState,
        toState: input.newState,
        changedByStaffId: portalStaff?.id ?? input.staffId,
      });

      // Pet Tracker links are operationally useful but must not be sent during the
      // prototype. A successful send is logged and marked once to prevent repeats.
      if (input.newState === "checked_in" && !appt.trackerSmsSent && appt.trackerToken && process.env.SMS_AUTOMATION_ENABLED === "true") {
        const [trackerRecipient] = await db.select({
          firstName: clients.firstName,
          phone: clients.phone,
          petName: pets.name,
          tenantName: tenants.name,
        }).from(appointments)
          .leftJoin(clients, eq(appointments.clientId, clients.id))
          .leftJoin(pets, eq(appointments.petId, pets.id))
          .leftJoin(tenants, eq(appointments.tenantId, tenants.id))
          .where(eq(appointments.id, input.appointmentId))
          .limit(1);
        if (trackerRecipient?.phone) {
          const trackerUrl = `https://groomingsos-mqzfsvzv.manus.space/track/${appt.trackerToken}`;
          const body = buildPetTrackerSms({
            clientFirstName: trackerRecipient.firstName ?? "there",
            petName: trackerRecipient.petName ?? "your dog",
            salonName: trackerRecipient.tenantName ?? "Barkin' Beautiful",
            trackerUrl,
          });
          const result = await sendSms(trackerRecipient.phone, body);
          await db.insert(smsLogs).values({
            tenantId: appt.tenantId,
            clientId: appt.clientId,
            appointmentId: appt.id,
            toNumber: trackerRecipient.phone,
            body,
            twilioSid: result.sid,
            status: result.success ? "sent" : "failed",
            type: "tracker",
            direction: "outbound",
            errorMessage: result.error,
          });
          if (result.success) {
            await db.update(appointments).set({ trackerSmsSent: true }).where(eq(appointments.id, appt.id));
          }
        }
      }
      return { success: true };
    }),

  reschedule: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      scheduledStart: z.string(),
      scheduledEnd: z.string(),
      staffId: z.number().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);
      await db.update(appointments).set({
        scheduledStart: parseBrisbaneLocalDateTime(input.scheduledStart),
        scheduledEnd: parseBrisbaneLocalDateTime(input.scheduledEnd),
        staffId: input.staffId ?? null,
      }).where(eq(appointments.id, input.appointmentId));
      return { success: true };
    }),

  updateDetails: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "other"]).optional(),
      notes: z.string().optional().nullable(),
      price: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.serviceType !== undefined) updates.serviceType = input.serviceType;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.price !== undefined) updates.price = input.price;
      await db.update(appointments).set(updates).where(eq(appointments.id, input.appointmentId));
      return { success: true };
    }),

  deleteAppointment: operationalProcedure
    .input(z.object({ appointmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [target] = await db
        .select({ id: appointments.id, tenantId: appointments.tenantId, sessionId: appointments.sessionId })
        .from(appointments)
        .where(eq(appointments.id, input.appointmentId))
        .limit(1);
      if (!target) throw new Error("Appointment not found");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, target.id);

      const sessionRows = target.sessionId
        ? await db
            .select({ id: appointments.id })
            .from(appointments)
            .where(and(eq(appointments.tenantId, target.tenantId), eq(appointments.sessionId, target.sessionId)))
        : [];
      const appointmentIds = resolveAppointmentDeletionIds(target.id, target.sessionId, sessionRows.map((row) => row.id));

      // Capture all records affected by this action before deletion. The snapshot is
      // retained only in the short-lived, one-use undo window returned to the admin.
      const deletedAppointments = await db.select().from(appointments).where(inArray(appointments.id, appointmentIds));
      const deletedWorkflowLogs = await db.select().from(workflowLogs).where(inArray(workflowLogs.appointmentId, appointmentIds));
      const deletedGroomingReports = await db.select().from(groomingReports).where(inArray(groomingReports.appointmentId, appointmentIds));
      const linkedInvoices = await db.select({ id: invoices.id, appointmentId: invoices.appointmentId }).from(invoices).where(inArray(invoices.appointmentId, appointmentIds));
      const linkedPetPhotos = await db.select({ id: petPhotos.id, appointmentId: petPhotos.appointmentId }).from(petPhotos).where(inArray(petPhotos.appointmentId, appointmentIds));
      const linkedStyleNotes = await db.select({ id: groomStyleNotes.id, appointmentId: groomStyleNotes.appointmentId }).from(groomStyleNotes).where(inArray(groomStyleNotes.appointmentId, appointmentIds));
      const linkedSmsLogs = await db.select({ id: smsLogs.id, appointmentId: smsLogs.appointmentId }).from(smsLogs).where(inArray(smsLogs.appointmentId, appointmentIds));
      const retainedLinks = <T extends { id: number; appointmentId: number | null }>(rows: T[]) => rows
        .filter((row): row is T & { appointmentId: number } => row.appointmentId !== null)
        .map(({ id, appointmentId }) => ({ id, appointmentId }));
      const undoSnapshot: AppointmentDeletionSnapshot = {
        appointments: deletedAppointments as unknown as Record<string, unknown>[],
        workflowLogs: deletedWorkflowLogs as unknown as Record<string, unknown>[],
        groomingReports: deletedGroomingReports as unknown as Record<string, unknown>[],
        invoiceLinks: retainedLinks(linkedInvoices),
        petPhotoLinks: retainedLinks(linkedPetPhotos),
        styleNoteLinks: retainedLinks(linkedStyleNotes),
        smsLogLinks: retainedLinks(linkedSmsLogs),
      };

      // Keep finance and client-history records intact where the appointment link is optional.
      // Remove only records that cannot exist without their parent appointment.
      await db.delete(workflowLogs).where(inArray(workflowLogs.appointmentId, appointmentIds));
      await db.delete(groomingReports).where(inArray(groomingReports.appointmentId, appointmentIds));
      await db.update(invoices).set({ appointmentId: null }).where(inArray(invoices.appointmentId, appointmentIds));
      await db.update(petPhotos).set({ appointmentId: null }).where(inArray(petPhotos.appointmentId, appointmentIds));
      await db.update(groomStyleNotes).set({ appointmentId: null }).where(inArray(groomStyleNotes.appointmentId, appointmentIds));
      await db.update(smsLogs).set({ appointmentId: null }).where(inArray(smsLogs.appointmentId, appointmentIds));
      await db.delete(appointments).where(inArray(appointments.id, appointmentIds));

      const undo = createAppointmentDeletionUndo(undoSnapshot);
      return { success: true, deleted: appointmentIds.length, undoToken: undo.token, undoExpiresAt: undo.expiresAt };
    }),

  undoDeleteAppointment: operationalProcedure
    .input(z.object({ undoToken: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const pendingSnapshot = getAppointmentDeletionUndo(input.undoToken);
      if (!pendingSnapshot) throw new Error("This undo window has expired. The booking can no longer be restored automatically.");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      const snapshotTenantIds = new Set(pendingSnapshot.appointments.map((row) => Number(row.tenantId)).filter(Number.isFinite));
      if (portalStaff && Array.from(snapshotTenantIds).some((tenantId) => tenantId !== portalStaff.tenantId)) {
        throw new Error("This booking is not available to your salon staff profile");
      }
      const snapshot = consumeAppointmentDeletionUndo(input.undoToken);
      if (!snapshot) throw new Error("This undo window has expired. The booking can no longer be restored automatically.");
      const appointmentIds = snapshot.appointments.map((row) => Number(row.id)).filter(Number.isFinite);
      const existing = appointmentIds.length > 0
        ? await db.select({ id: appointments.id }).from(appointments).where(inArray(appointments.id, appointmentIds)).limit(1)
        : [];
      if (existing.length > 0) throw new Error("This booking has already been restored.");

      if (snapshot.appointments.length > 0) await db.insert(appointments).values(snapshot.appointments as any);
      if (snapshot.workflowLogs.length > 0) await db.insert(workflowLogs).values(snapshot.workflowLogs as any);
      if (snapshot.groomingReports.length > 0) await db.insert(groomingReports).values(snapshot.groomingReports as any);

      for (const link of snapshot.invoiceLinks) await db.update(invoices).set({ appointmentId: link.appointmentId }).where(eq(invoices.id, link.id));
      for (const link of snapshot.petPhotoLinks) await db.update(petPhotos).set({ appointmentId: link.appointmentId }).where(eq(petPhotos.id, link.id));
      for (const link of snapshot.styleNoteLinks) await db.update(groomStyleNotes).set({ appointmentId: link.appointmentId }).where(eq(groomStyleNotes.id, link.id));
      for (const link of snapshot.smsLogLinks) await db.update(smsLogs).set({ appointmentId: link.appointmentId }).where(eq(smsLogs.id, link.id));

      return { success: true, restored: snapshot.appointments.length };
    }),
});

// ─── Workflow Board ───────────────────────────────────────────────────────────
const workflowRouter = router({
  getTodayBoard: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This workflow is not available to your salon staff profile");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return db
        .select({
          id: appointments.id,
          workflowState: appointments.workflowState,
          scheduledStart: appointments.scheduledStart,
          estimatedPickupAt: appointments.estimatedPickupAt,
          serviceType: appointments.serviceType,
          petName: pets.name,
          petBreed: pets.breed,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          staffName: staff.name,
          staffColour: staff.colourHex,
          staffId: appointments.staffId,
        })
        .from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(clients, eq(appointments.clientId, clients.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          gte(appointments.scheduledStart, today),
          lte(appointments.scheduledStart, tomorrow),
        ))
        .orderBy(asc(appointments.scheduledStart));
    }),

  getBoard: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      date: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This workflow is not available to your salon staff profile");
      const dateStr = input.date || new Date(Date.now() + 10 * 3600000).toISOString().slice(0, 10);
      // AEST = UTC+10. Midnight AEST = 14:00 UTC previous day.
      const [y, m, d] = dateStr.split('-').map(Number);
      // Build UTC timestamps for start/end of the AEST day
      const dayStartUTC = new Date(Date.UTC(y, m - 1, d - 1, 14, 0, 0, 0)); // midnight AEST
      const dayEndUTC = new Date(Date.UTC(y, m - 1, d, 13, 59, 59, 999));   // 23:59:59 AEST
      const dayStart = dayStartUTC;
      const dayEnd = dayEndUTC;
      const boardRows = await db
        .select({
          id: appointments.id,
          sessionId: appointments.sessionId,
          scheduledStart: appointments.scheduledStart,
          scheduledEnd: appointments.scheduledEnd,
          workflowState: appointments.workflowState,
          serviceType: appointments.serviceType,
          price: appointments.price,
          status: appointments.status,
          notes: appointments.notes,
          cageNumber: appointments.cageNumber,
          tagNumber: appointments.tagNumber,
          bathStaffId: appointments.bathStaffId,
          bathPriority: appointments.bathPriority,
          bathQueueOrder: appointments.bathQueueOrder,
          bathGroupId: appointments.bathGroupId,
          dryStaffId: appointments.dryStaffId,
          workflowAddOns: appointments.workflowAddOns,
          checkedInAt: appointments.checkedInAt,
          stageStartedAt: appointments.stageStartedAt,
          bathingStartedAt: appointments.bathingStartedAt,
          bathingCompletedAt: appointments.bathingCompletedAt,
          dryingStartedAt: appointments.dryingStartedAt,
          dryingCompletedAt: appointments.dryingCompletedAt,
          groomingStartedAt: appointments.groomingStartedAt,
          groomingCompletedAt: appointments.groomingCompletedAt,
          readyAt: appointments.readyAt,
          completedAt: appointments.completedAt,
          pickedUpAt: appointments.pickedUpAt,
          staffId: appointments.staffId,
          petId: appointments.petId,
          clientId: appointments.clientId,
          membershipId: appointments.membershipId,
          petName: pets.name,
          petBreed: pets.breed,
          petWeightKg: pets.weightKg,
          petWeight: pets.weight,
          petAlertLevel: pets.alertLevel,
          petWarnings: pets.warnings,
          petFamilyGroupId: pets.familyGroupId,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          staffName: staff.name,
          staffColour: staff.colourHex,
        })
        .from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(clients, eq(appointments.clientId, clients.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          gte(appointments.scheduledStart, dayStart),
          lte(appointments.scheduledStart, dayEnd),
          sql`${appointments.status} NOT IN ('cancelled', 'no_show')`,
        ))
        .orderBy(asc(appointments.scheduledStart));

      const familyGroupIds = Array.from(new Set(boardRows.map(row => row.petFamilyGroupId).filter((id): id is number => id !== null)));
      const familyPetNamesByGroup = new Map<number, string[]>();
      if (familyGroupIds.length > 0) {
        const familyPets = await db.select({ familyGroupId: pets.familyGroupId, name: pets.name })
          .from(pets)
          .where(and(eq(pets.tenantId, input.tenantId), inArray(pets.familyGroupId, familyGroupIds)))
          .orderBy(asc(pets.name));
        for (const familyPet of familyPets) {
          if (!familyPet.familyGroupId) continue;
          const names = familyPetNamesByGroup.get(familyPet.familyGroupId) ?? [];
          names.push(familyPet.name);
          familyPetNamesByGroup.set(familyPet.familyGroupId, names);
        }
      }

      const appointmentIds = boardRows.map(row => row.id);
      const latestGroomNoteByAppointment = new Map<number, { note: string; warnings: string | null; alertLevel: string | null }>();
      if (appointmentIds.length > 0) {
        const styleNoteRows = await db
          .select({
            appointmentId: groomStyleNotes.appointmentId,
            note: groomStyleNotes.note,
            warnings: groomStyleNotes.warnings,
            alertLevel: groomStyleNotes.alertLevel,
            createdAt: groomStyleNotes.createdAt,
          })
          .from(groomStyleNotes)
          .where(inArray(groomStyleNotes.appointmentId, appointmentIds))
          .orderBy(asc(groomStyleNotes.createdAt));
        // Rows are ordered oldest-first, so the last write per appointmentId
        // (via Map overwrite) ends up being the most recent style note.
        for (const noteRow of styleNoteRows) {
          if (noteRow.appointmentId === null) continue;
          latestGroomNoteByAppointment.set(noteRow.appointmentId, {
            note: noteRow.note,
            warnings: noteRow.warnings,
            alertLevel: noteRow.alertLevel,
          });
        }
      }

      return boardRows.map(row => ({
        ...row,
        familyPetNames: row.petFamilyGroupId ? familyPetNamesByGroup.get(row.petFamilyGroupId) ?? [row.petName] : [],
        petAlertLevel: normalizePetAlertLevel(row.petAlertLevel),
        groomStyleNote: latestGroomNoteByAppointment.get(row.id)?.note ?? null,
        groomStyleWarnings: latestGroomNoteByAppointment.get(row.id)?.warnings ?? null,
      }));
    }),

  updateStage: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      workflowState: z.enum(["scheduled", "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready", "complete", "cancelled", "no_show"]).optional(),
      cageNumber: z.number().nullable().optional(),
      tagNumber: z.number().nullable().optional(),
      bathStaffId: z.number().nullable().optional(),
      dryStaffId: z.number().nullable().optional(),
      staffId: z.number().nullable().optional(),
      workflowAddOns: z.string().nullable().optional(),
      checkedInAt: z.number().nullable().optional(),
      completedAt: z.number().nullable().optional(),
      pickedUpAt: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const { appointmentId, ...fields } = input;
      const [currentAppointment] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
      if (!currentAppointment) throw new Error("Appointment not found");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, appointmentId);
      const updateData: Record<string, unknown> = {};
      let workflowChangedAtMs: number | null = null;
      if (fields.workflowState !== undefined) {
        const now = Date.now();
        workflowChangedAtMs = now;
        updateData.workflowState = fields.workflowState;
        if (fields.workflowState === "cancelled" || fields.workflowState === "no_show") {
          updateData.status = fields.workflowState;
        } else if (currentAppointment.status === "cancelled" || currentAppointment.status === "no_show") {
          updateData.status = "confirmed";
        }
        Object.assign(updateData, deriveWorkflowTimingUpdate(currentAppointment as WorkflowState extends never ? never : any, fields.workflowState as WorkflowState, now));
      }
      if (fields.cageNumber !== undefined) updateData.cageNumber = fields.cageNumber;
      if (fields.tagNumber !== undefined) updateData.tagNumber = fields.tagNumber;
      if (fields.bathStaffId !== undefined) updateData.bathStaffId = fields.bathStaffId;
      if (fields.dryStaffId !== undefined) updateData.dryStaffId = fields.dryStaffId;
      if (fields.staffId !== undefined) updateData.staffId = fields.staffId;
      if (fields.workflowAddOns !== undefined) updateData.workflowAddOns = fields.workflowAddOns;
      if (fields.checkedInAt !== undefined) updateData.checkedInAt = fields.checkedInAt;
      if (fields.completedAt !== undefined) updateData.completedAt = fields.completedAt;
      if (fields.pickedUpAt !== undefined) updateData.pickedUpAt = fields.pickedUpAt;
      if (fields.notes !== undefined) updateData.notes = fields.notes;
      if (Object.keys(updateData).length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a workflow detail to update." });
      await db.update(appointments).set(updateData).where(eq(appointments.id, appointmentId));
      if (fields.workflowState !== undefined && workflowChangedAtMs !== null) {
        const [portalStaff] = await db.select({ id: staff.id, tenantId: staff.tenantId }).from(staff)
          .where(and(eq(staff.userId, ctx.user.id), eq(staff.tenantId, currentAppointment.tenantId))).limit(1);
        await db.insert(workflowLogs).values({
          appointmentId,
          fromState: currentAppointment.workflowState,
          toState: fields.workflowState,
          changedByStaffId: portalStaff?.id ?? null,
          changedAtMs: workflowChangedAtMs,
          changedAt: new Date(workflowChangedAtMs),
          notes: `Workflow changed from ${currentAppointment.workflowState} to ${fields.workflowState}`,
        });
        if (portalStaff) {
          await recordStaffAccessEvent(db, {
            tenantId: portalStaff.tenantId,
            staffId: portalStaff.id,
            actorUserId: ctx.user.id,
            eventType: "workflow_updated",
            appointmentId,
            workflowFromState: currentAppointment.workflowState,
            workflowToState: fields.workflowState,
            note: `Appointment ${appointmentId} moved to ${fields.workflowState}`,
          });
        }
      }
      return { success: true };
    }),

  setBathPriority: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      bathPriority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
      applyToLinkedDogs: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [appointment] = await db.select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        sessionId: appointments.sessionId,
        scheduledStart: appointments.scheduledStart,
        workflowState: appointments.workflowState,
        status: appointments.status,
        petFamilyGroupId: pets.familyGroupId,
        bathGroupId: appointments.bathGroupId,
      }).from(appointments).leftJoin(pets, eq(appointments.petId, pets.id))
        .where(eq(appointments.id, input.appointmentId)).limit(1);
      if (!appointment) throw new Error("Appointment not found");
      const portalStaff = await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);
      if (!isBathPriorityMutable(appointment.workflowState) || appointment.status === "cancelled" || appointment.status === "no_show") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bath priority cannot be changed after a terminal workflow outcome." });
      }

      let targetIds = [appointment.id];
      if (input.applyToLinkedDogs && appointment.bathGroupId?.trim()) {
        const linkedRows = await db.select({ id: appointments.id }).from(appointments).where(and(
          eq(appointments.tenantId, appointment.tenantId),
          eq(appointments.bathGroupId, appointment.bathGroupId),
          sql`${appointments.status} NOT IN ('cancelled', 'no_show')`,
          sql`${appointments.workflowState} <> 'complete'`,
        ));
        targetIds = linkedRows.map((row: { id: number }) => row.id);
      } else if (input.applyToLinkedDogs && appointment.sessionId?.trim()) {
        const linkedRows = await db.select({ id: appointments.id }).from(appointments).where(and(
          eq(appointments.tenantId, appointment.tenantId),
          eq(appointments.sessionId, appointment.sessionId),
          sql`${appointments.status} NOT IN ('cancelled', 'no_show')`,
          sql`${appointments.workflowState} <> 'complete'`,
        ));
        targetIds = linkedRows.map((row: { id: number }) => row.id);
      } else if (input.applyToLinkedDogs && appointment.petFamilyGroupId) {
        const linkedRows = await db.select({ id: appointments.id }).from(appointments)
          .leftJoin(pets, eq(appointments.petId, pets.id))
          .where(and(
            eq(appointments.tenantId, appointment.tenantId),
            eq(pets.familyGroupId, appointment.petFamilyGroupId),
            eq(appointments.scheduledStart, appointment.scheduledStart),
            sql`${appointments.status} NOT IN ('cancelled', 'no_show')`,
            sql`${appointments.workflowState} <> 'complete'`,
          ));
        targetIds = linkedRows.map((row: { id: number }) => row.id);
      }
      targetIds = Array.from(new Set(targetIds));
      await db.update(appointments).set({ bathPriority: input.bathPriority, bathQueueOrder: null }).where(and(
        eq(appointments.tenantId, appointment.tenantId),
        inArray(appointments.id, targetIds),
      ));

      if (portalStaff) {
        await recordStaffAccessEvent(db, {
          tenantId: portalStaff.tenantId,
          staffId: portalStaff.id,
          actorUserId: ctx.user.id,
          eventType: "bath_priority_updated",
          appointmentId: appointment.id,
          note: input.bathPriority
            ? `Bath priority ${input.bathPriority} set for ${targetIds.length} active linked booking${targetIds.length === 1 ? "" : "s"}`
            : `Bath priority cleared for ${targetIds.length} active linked booking${targetIds.length === 1 ? "" : "s"}`,
        });
      }
      return { success: true, updated: targetIds.length };
    }),

  setBathGroup: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      linkedAppointmentIds: z.array(z.number()).max(12),
      bathPriority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [anchor] = await db.select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        workflowState: appointments.workflowState,
        status: appointments.status,
        bathPriority: appointments.bathPriority,
        bathGroupId: appointments.bathGroupId,
      }).from(appointments).where(eq(appointments.id, input.appointmentId)).limit(1);
      if (!anchor) throw new Error("Appointment not found");
      const portalStaff = await requireApprovedStaffAppointmentAccess(db, ctx.user, anchor.id);
      if (!isBathPriorityMutable(anchor.workflowState) || anchor.status === "cancelled" || anchor.status === "no_show") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bath groups cannot be changed after a terminal workflow outcome." });
      }

      const [year, month, day] = input.date.split("-").map(Number);
      const dayStart = new Date(Date.UTC(year!, month! - 1, day! - 1, 14, 0, 0, 0));
      const dayEnd = new Date(Date.UTC(year!, month! - 1, day!, 13, 59, 59, 999));
      const targetIds = Array.from(new Set([anchor.id, ...input.linkedAppointmentIds]));
      const targetRows = await db.select({
        id: appointments.id,
        workflowState: appointments.workflowState,
        status: appointments.status,
        bathPriority: appointments.bathPriority,
        bathGroupId: appointments.bathGroupId,
      }).from(appointments).where(and(
        eq(appointments.tenantId, anchor.tenantId),
        inArray(appointments.id, targetIds),
        gte(appointments.scheduledStart, dayStart),
        lte(appointments.scheduledStart, dayEnd),
      ));
      if (targetRows.length !== targetIds.length || targetRows.some((row: any) => !isBathPriorityMutable(row.workflowState) || row.status === "cancelled" || row.status === "no_show")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only active appointments in your salon can be coordinated for bathing." });
      }

      const previousGroupIds = Array.from(new Set(targetRows.map((row: any) => row.bathGroupId).filter((groupId: string | null): groupId is string => Boolean(groupId))));
      if (previousGroupIds.length > 0) {
        await db.update(appointments).set({ bathGroupId: null }).where(and(
          eq(appointments.tenantId, anchor.tenantId),
          inArray(appointments.bathGroupId, previousGroupIds),
        ));
      }

      const groupId = targetIds.length > 1 ? `bath-${nanoid(12)}` : null;
      const inheritedPriority = input.bathPriority !== undefined
        ? input.bathPriority
        : anchor.bathPriority ?? targetRows.find((row: any) => row.bathPriority !== null)?.bathPriority ?? null;
      await db.update(appointments).set({
        bathGroupId: groupId,
        bathPriority: inheritedPriority,
        bathQueueOrder: null,
      }).where(and(eq(appointments.tenantId, anchor.tenantId), inArray(appointments.id, targetIds)));

      if (portalStaff) {
        await recordStaffAccessEvent(db, {
          tenantId: portalStaff.tenantId,
          staffId: portalStaff.id,
          actorUserId: ctx.user.id,
          eventType: "bath_priority_updated",
          appointmentId: anchor.id,
          note: groupId
            ? `${targetIds.length} dogs coordinated for bathing${inheritedPriority ? ` at priority ${inheritedPriority}` : ""}`
            : "Bath coordination removed",
        });
      }
      return { success: true, groupId, updated: targetIds.length, bathPriority: inheritedPriority };
    }),

  reorderBathQueue: operationalProcedure
    .input(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      orderedQueueRepresentativeIds: z.array(z.number()).min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const firstAppointmentId = input.orderedQueueRepresentativeIds[0]!;
      const [firstAppointment] = await db.select({ id: appointments.id, tenantId: appointments.tenantId }).from(appointments).where(eq(appointments.id, firstAppointmentId)).limit(1);
      if (!firstAppointment) throw new Error("Appointment not found");
      const portalStaff = await requireApprovedStaffAppointmentAccess(db, ctx.user, firstAppointmentId);
      const [year, month, day] = input.date.split("-").map(Number);
      const dayStart = new Date(Date.UTC(year!, month! - 1, day! - 1, 14, 0, 0, 0));
      const dayEnd = new Date(Date.UTC(year!, month! - 1, day!, 13, 59, 59, 999));
      const queueRows = await db.select({
        id: appointments.id,
        bathPriority: appointments.bathPriority,
        bathQueueOrder: appointments.bathQueueOrder,
        bathGroupId: appointments.bathGroupId,
        petName: pets.name,
        scheduledStart: appointments.scheduledStart,
        sessionId: appointments.sessionId,
        petFamilyGroupId: pets.familyGroupId,
        workflowState: appointments.workflowState,
      }).from(appointments).leftJoin(pets, eq(appointments.petId, pets.id)).where(and(
        eq(appointments.tenantId, firstAppointment.tenantId),
        gte(appointments.scheduledStart, dayStart),
        lte(appointments.scheduledStart, dayEnd),
        sql`${appointments.status} NOT IN ('cancelled', 'no_show')`,
        sql`${appointments.workflowState} <> 'complete'`,
      ));
      const queue = buildBathPriorityQueue(queueRows);
      const expectedRepresentativeIds = queue.map(item => item.rows[0]!.id);
      const suppliedIds = input.orderedQueueRepresentativeIds;
      if (suppliedIds.length !== expectedRepresentativeIds.length || new Set(suppliedIds).size !== suppliedIds.length || expectedRepresentativeIds.some(id => !suppliedIds.includes(id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The bath queue has changed. Refresh and try reordering again." });
      }

      for (let index = 0; index < suppliedIds.length; index += 1) {
        const representativeId = suppliedIds[index]!;
        const queueItem = queue.find(item => item.rows[0]!.id === representativeId)!;
        await db.update(appointments).set({
          bathPriority: Math.min(index + 1, 5),
          bathQueueOrder: index + 1,
        }).where(and(eq(appointments.tenantId, firstAppointment.tenantId), inArray(appointments.id, queueItem.rows.map(row => row.id))));
      }
      if (portalStaff) {
        await recordStaffAccessEvent(db, {
          tenantId: portalStaff.tenantId,
          staffId: portalStaff.id,
          actorUserId: ctx.user.id,
          eventType: "bath_priority_updated",
          appointmentId: firstAppointmentId,
          note: `Bath queue reordered across ${suppliedIds.length} queue group${suppliedIds.length === 1 ? "" : "s"}`,
        });
      }
      return { success: true };
    }),

  getStaff: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This staff directory is not available to your salon staff profile");
      return db.select({ id: staff.id, name: staff.name, role: staff.role, colourHex: staff.colourHex })
        .from(staff)
        .where(and(eq(staff.tenantId, input.tenantId), eq(staff.isActive, true)))
        .orderBy(asc(staff.name));
    }),
});

// ─── Pet Tracker (public) ─────────────────────────────────────────────────────
const trackerRouter = router({
  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select({
          id: appointments.id,
          workflowState: appointments.workflowState,
          scheduledStart: appointments.scheduledStart,
          estimatedPickupAt: appointments.estimatedPickupAt,
          serviceType: appointments.serviceType,
          petName: pets.name,
          petBreed: pets.breed,
          clientFirstName: clients.firstName,
          staffName: staff.name,
          tenantName: tenants.name,
          tenantPhone: tenants.phone,
        })
        .from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(clients, eq(appointments.clientId, clients.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .leftJoin(tenants, eq(appointments.tenantId, tenants.id))
        .where(eq(appointments.trackerToken, input.token))
        .limit(1);
      return row ?? null;
    }),

  getSiblings: protectedProcedure
    .input(z.object({
      appointmentId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Get the base appointment
      const [base] = await db
        .select({
          clientId: appointments.clientId,
          scheduledStart: appointments.scheduledStart,
          scheduledEnd: appointments.scheduledEnd,
        })
        .from(appointments)
        .where(eq(appointments.id, input.appointmentId))
        .limit(1);
      if (!base) return [];
      // Find all appointments for same client that overlap (within 30 min of start)
      const windowMs = 30 * 60 * 1000;
      const windowStart = new Date(base.scheduledStart.getTime() - windowMs);
      const windowEnd = new Date(base.scheduledStart.getTime() + windowMs);
      const siblings = await db
        .select({
          id: appointments.id,
          scheduledStart: appointments.scheduledStart,
          scheduledEnd: appointments.scheduledEnd,
          serviceType: appointments.serviceType,
          workflowState: appointments.workflowState,
          price: appointments.price,
          notes: appointments.notes,
          staffId: appointments.staffId,
          petId: appointments.petId,
          petName: pets.name,
          petBreed: pets.breed,
          petGender: pets.gender,
          petWeightKg: pets.weightKg,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(and(
          eq(appointments.clientId, base.clientId),
          sql`${appointments.scheduledStart} BETWEEN ${windowStart} AND ${windowEnd}`,
          sql`${appointments.id} != ${input.appointmentId}`,
        ))
        .orderBy(asc(appointments.scheduledStart));
      return siblings;
    }),
});

// ─── Workflow timing review configuration and alerts ─────────────────────────
const timingReviewThresholdInput = z.object({
  tenantId: z.number().default(1),
  scope: z.enum(["default", "size", "breed"]),
  petSize: z.enum(["small", "small_medium", "medium", "large", "extra_large", "giant"]).optional(),
  breedName: z.string().trim().min(1).max(100).optional(),
  bathMinutes: z.number().int().min(1).max(1440),
  dryMinutes: z.number().int().min(1).max(1440),
  groomMinutes: z.number().int().min(1).max(1440),
  totalMinutes: z.number().int().min(1).max(1440),
});

function timingReviewRules(rows: Array<typeof workflowTimingReviewThresholds.$inferSelect>): TimingReviewThresholdRule[] {
  return rows.map((row) => ({
    scope: row.scope,
    scopeKey: row.scopeKey,
    petSize: row.petSize,
    breedName: row.breedName,
    bathMinutes: row.bathMinutes,
    dryMinutes: row.dryMinutes,
    groomMinutes: row.groomMinutes,
    totalMinutes: row.totalMinutes,
  }));
}

function brisbaneDateKey(value: Date | string | number) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function brisbaneDayRange(dateInput?: string) {
  const date = dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ? dateInput
    : brisbaneDateKey(new Date());
  const [year, month, day] = date.split("-").map(Number);
  return {
    date,
    start: new Date(Date.UTC(year, month - 1, day - 1, 14, 0, 0, 0)),
    endExclusive: new Date(Date.UTC(year, month - 1, day, 14, 0, 0, 0)),
  };
}

const workflowReviewRouter = router({
  getThresholds: adminProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { defaults: DEFAULT_TIMING_REVIEW_THRESHOLDS, rules: [], sizePresets: TIMING_REVIEW_SIZE_PRESETS };
      const rows = await db.select().from(workflowTimingReviewThresholds).where(eq(workflowTimingReviewThresholds.tenantId, input.tenantId));
      return { defaults: DEFAULT_TIMING_REVIEW_THRESHOLDS, rules: timingReviewRules(rows), sizePresets: TIMING_REVIEW_SIZE_PRESETS };
    }),

  getBoardThresholds: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { defaults: DEFAULT_TIMING_REVIEW_THRESHOLDS, rules: [] };
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This workflow is not available to your salon staff profile");
      const rows = await db.select().from(workflowTimingReviewThresholds).where(eq(workflowTimingReviewThresholds.tenantId, input.tenantId));
      return { defaults: DEFAULT_TIMING_REVIEW_THRESHOLDS, rules: timingReviewRules(rows) };
    }),

  upsertThreshold: adminProcedure
    .input(timingReviewThresholdInput)
    .mutation(async ({ input }) => {
      if (input.scope === "size" && !input.petSize) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a pet size for this preset." });
      if (input.scope === "breed" && !input.breedName) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a breed name for this override." });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const breedName = input.scope === "breed" ? input.breedName?.trim() ?? null : null;
      const petSize = input.scope === "size" ? input.petSize ?? null : null;
      const scopeKey = getTimingReviewScopeKey({ scope: input.scope, petSize, breedName });
      await db.insert(workflowTimingReviewThresholds).values({
        tenantId: input.tenantId,
        scope: input.scope,
        scopeKey,
        petSize,
        breedName,
        bathMinutes: input.bathMinutes,
        dryMinutes: input.dryMinutes,
        groomMinutes: input.groomMinutes,
        totalMinutes: input.totalMinutes,
      }).onDuplicateKeyUpdate({ set: { petSize, breedName, bathMinutes: input.bathMinutes, dryMinutes: input.dryMinutes, groomMinutes: input.groomMinutes, totalMinutes: input.totalMinutes } });
      return { success: true, scopeKey };
    }),

  removeThreshold: adminProcedure
    .input(z.object({ tenantId: z.number().default(1), scope: z.enum(["default", "size", "breed"]), petSize: z.enum(["small", "small_medium", "medium", "large", "extra_large", "giant"]).optional(), breedName: z.string().trim().min(1).max(100).optional() }))
    .mutation(async ({ input }) => {
      if (input.scope === "size" && !input.petSize) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a pet size to reset." });
      if (input.scope === "breed" && !input.breedName) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a breed name to reset." });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const scopeKey = getTimingReviewScopeKey({ scope: input.scope, petSize: input.petSize, breedName: input.breedName });
      await db.delete(workflowTimingReviewThresholds).where(and(eq(workflowTimingReviewThresholds.tenantId, input.tenantId), eq(workflowTimingReviewThresholds.scopeKey, scopeKey)));
      return { success: true };
    }),

  getAlerts: adminProcedure
    .input(z.object({ tenantId: z.number().default(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const range = brisbaneDayRange(input.date);
      const thresholdRows = await db.select().from(workflowTimingReviewThresholds).where(eq(workflowTimingReviewThresholds.tenantId, input.tenantId));
      const rules = timingReviewRules(thresholdRows);
      const staffRows = await db.select({ id: staff.id, name: staff.name }).from(staff).where(eq(staff.tenantId, input.tenantId));
      const staffNameById = new Map(staffRows.map((member) => [member.id, member.name]));
      const rows = await db.select({
        appointmentId: appointments.id,
        scheduledStart: appointments.scheduledStart,
        petName: pets.name,
        petBreed: pets.breed,
        petWeightKg: pets.weightKg,
        petWeight: pets.weight,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        groomerId: appointments.staffId,
        bathStaffId: appointments.bathStaffId,
        dryStaffId: appointments.dryStaffId,
        bathingStartedAt: appointments.bathingStartedAt,
        bathingCompletedAt: appointments.bathingCompletedAt,
        dryingStartedAt: appointments.dryingStartedAt,
        dryingCompletedAt: appointments.dryingCompletedAt,
        groomingStartedAt: appointments.groomingStartedAt,
        groomingCompletedAt: appointments.groomingCompletedAt,
        checkedInAt: appointments.checkedInAt,
        completedAt: appointments.completedAt,
      }).from(appointments).leftJoin(pets, eq(appointments.petId, pets.id)).leftJoin(clients, eq(appointments.clientId, clients.id)).where(and(
        eq(appointments.tenantId, input.tenantId),
        gte(appointments.scheduledStart, range.start),
        lt(appointments.scheduledStart, range.endExclusive),
        sql`${appointments.status} NOT IN ('cancelled', 'no_show')`,
      ));
      const duration = (start: number | null, end: number | null) => start !== null && end !== null && end >= start ? Math.floor((end - start) / 60000) : null;
      return rows.flatMap((row) => {
        const threshold = resolveTimingReviewThreshold({ breed: row.petBreed, weightKg: row.petWeightKg, weight: row.petWeight }, rules);
        const clientName = [row.clientFirstName, row.clientLastName].filter(Boolean).join(" ") || "Client";
        const stages = [
          { key: "bath", stage: "Bath", staffId: row.bathStaffId, durationMinutes: duration(row.bathingStartedAt, row.bathingCompletedAt), thresholdMinutes: threshold.thresholds.bathMinutes },
          { key: "dry", stage: "Dry", staffId: row.dryStaffId, durationMinutes: duration(row.dryingStartedAt, row.dryingCompletedAt), thresholdMinutes: threshold.thresholds.dryMinutes },
          { key: "groom", stage: "Groom", staffId: row.groomerId, durationMinutes: duration(row.groomingStartedAt, row.groomingCompletedAt), thresholdMinutes: threshold.thresholds.groomMinutes },
          { key: "total", stage: "Total salon time", staffId: row.groomerId, durationMinutes: duration(row.checkedInAt, row.completedAt), thresholdMinutes: threshold.thresholds.totalMinutes },
        ];
        return stages.filter((stage) => stage.staffId !== null && stage.durationMinutes !== null && stage.durationMinutes > stage.thresholdMinutes).map((stage) => ({
          appointmentId: row.appointmentId,
          date: range.date,
          petName: row.petName ?? "Pet",
          clientName,
          staffName: staffNameById.get(stage.staffId ?? 0) ?? "Team member",
          thresholdSource: threshold.source,
          ...stage,
        }));
      });
    }),
});

// ─── Clients ──────────────────────────────────────────────────────────────────
const clientsRouter = router({
  list: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      search: z.string().optional(),
      status: z.enum(["active", "inactive", "lapsed", "blocked"]).optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
      sortBy: z.enum(["firstName", "lastName", "email", "phone", "status", "createdAt"]).default("firstName"),
      sortDir: z.enum(["asc", "desc"]).default("asc"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { clients: [], total: 0 };
      const offset = (input.page - 1) * input.pageSize;
      const conditions = [eq(clients.tenantId, input.tenantId)];
      if (input.status) conditions.push(eq(clients.status, input.status));
      if (input.search) {
        conditions.push(
          sql`CONCAT(${clients.firstName}, ' ', ${clients.lastName}) LIKE ${`%${input.search}%`}`
        );
      }
      const colMap = {
        firstName: clients.firstName,
        lastName: clients.lastName,
        email: clients.email,
        phone: clients.phone,
        status: clients.status,
        createdAt: clients.createdAt,
      } as const;
      const col = colMap[input.sortBy];
      const orderExpr = input.sortDir === "desc" ? desc(col) : asc(col);
      // secondary sort always by firstName asc for stability
      const secondaryExpr = input.sortBy === "firstName" ? asc(clients.lastName) : asc(clients.firstName);
      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(clients)
        .where(and(...conditions));
      const total = Number(countRow?.count ?? 0);
      const rows = await db.select().from(clients)
        .where(and(...conditions))
        .orderBy(orderExpr, secondaryExpr)
        .limit(input.pageSize).offset(offset);
      return { clients: rows, total };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [client] = await db.select().from(clients).where(eq(clients.id, input.id)).limit(1);
      if (!client) return null;
      const clientPets = await db.select().from(pets).where(eq(pets.clientId, input.id));
      const clientMemberships = await db.select().from(memberships).where(eq(memberships.clientId, input.id));
      const recentAppointments = await db
        .select({
          id: appointments.id,
          scheduledStart: appointments.scheduledStart,
          serviceType: appointments.serviceType,
          workflowState: appointments.workflowState,
          price: appointments.price,
          petName: pets.name,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(eq(appointments.clientId, input.id))
        .orderBy(desc(appointments.scheduledStart))
        .limit(20);
      return { client, pets: clientPets, memberships: clientMemberships, appointments: recentAppointments };
    }),

  create: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
      referralSource: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(clients).values(input);
      return { success: true, id: (result as any).insertId as number };
    }),

  // Quick hover-card preview: pets + last 3 appointments
  quickPreview: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { pets: [], appointments: [] };
      const clientPets = await db
        .select({ id: pets.id, name: pets.name, breed: pets.breed })
        .from(pets)
        .where(eq(pets.clientId, input.clientId))
        .limit(5);
      const recentAppts = await db
        .select({
          id: appointments.id,
          scheduledStart: appointments.scheduledStart,
          serviceType: appointments.serviceType,
          workflowState: appointments.workflowState,
          petName: pets.name,
        })
        .from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .where(eq(appointments.clientId, input.clientId))
        .orderBy(desc(appointments.scheduledStart))
        .limit(3);
      return { pets: clientPets, appointments: recentAppts };
    }),

  // Export all matching clients as CSV rows
  exportCsv: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      search: z.string().optional(),
      status: z.enum(["active", "inactive", "lapsed", "blocked"]).optional(),
      sortBy: z.enum(["firstName", "lastName", "email", "phone", "status", "createdAt"]).default("firstName"),
      sortDir: z.enum(["asc", "desc"]).default("asc"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [] };
      const conditions = [eq(clients.tenantId, input.tenantId)];
      if (input.status) conditions.push(eq(clients.status, input.status));
      if (input.search) {
        conditions.push(
          sql`CONCAT(${clients.firstName}, ' ', ${clients.lastName}) LIKE ${`%${input.search}%`}`
        );
      }
      const colMap = {
        firstName: clients.firstName,
        lastName: clients.lastName,
        email: clients.email,
        phone: clients.phone,
        status: clients.status,
        createdAt: clients.createdAt,
      } as const;
      const col = colMap[input.sortBy];
      const orderExpr = input.sortDir === "desc" ? desc(col) : asc(col);
      const secondaryExpr = input.sortBy === "firstName" ? asc(clients.lastName) : asc(clients.firstName);
      const rows = await db
        .select({
          id: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
          email: clients.email,
          phone: clients.phone,
          address: clients.address,
          status: clients.status,
          referralSource: clients.referralSource,
          createdAt: clients.createdAt,
        })
        .from(clients)
        .where(and(...conditions))
        .orderBy(orderExpr, secondaryExpr)
        .limit(20000); // safety cap
      return { rows };
    }),

  addPetPhoto: protectedProcedure
    .input(z.object({
      petId: z.number(),
      url: z.string().min(1),
      storageKey: z.string().min(1),
      caption: z.string().max(500).optional(),
      appointmentId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [pet] = await db
        .select({ id: pets.id, tenantId: pets.tenantId })
        .from(pets)
        .where(eq(pets.id, input.petId))
        .limit(1);
      if (!pet) throw new Error("Pet not found");
      const [created] = await db.insert(petPhotos).values({
        tenantId: pet.tenantId,
        petId: input.petId,
        appointmentId: input.appointmentId ?? null,
        url: input.url,
        storageKey: input.storageKey,
        caption: input.caption?.trim() || null,
      }).$returningId();
      return { id: created.id };
    }),

  getProfile: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      // Client details
      const [client] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, input.clientId))
        .limit(1);
      if (!client) return null;
      // Pets
      const clientPets = await db
        .select({
          id: pets.id,
          name: pets.name,
          breed: pets.breed,
          species: pets.species,
          gender: pets.gender,
          weightKg: pets.weightKg,
          weight: pets.weight,
          coatType: pets.coatType,
          colour: pets.colour,
          desexed: pets.desexed,
          behaviourNotes: pets.behaviourNotes,
          groomingNotes: pets.groomingNotes,
          alertLevel: pets.alertLevel,
          warnings: pets.warnings,
          familyGroupId: pets.familyGroupId,
          dateOfBirth: pets.dateOfBirth,
          createdAt: pets.createdAt,
          status: pets.status,
          departedAt: pets.departedAt,
        })
        .from(pets)
        .where(eq(pets.clientId, input.clientId));
      const additionalContacts = await db.select({
        id: clientContacts.id,
        name: clientContacts.name,
        phone: clientContacts.phone,
        email: clientContacts.email,
        relationship: clientContacts.relationship,
        createdAt: clientContacts.createdAt,
      }).from(clientContacts)
        .where(and(eq(clientContacts.clientId, input.clientId), eq(clientContacts.tenantId, client.tenantId)))
        .orderBy(asc(clientContacts.name));
      const petIds = clientPets.map(pet => pet.id);
      const clientPhotos = petIds.length > 0
        ? await db
          .select({
            id: petPhotos.id,
            petId: petPhotos.petId,
            url: petPhotos.url,
            caption: petPhotos.caption,
            takenAt: petPhotos.takenAt,
            appointmentId: petPhotos.appointmentId,
          })
          .from(petPhotos)
          .where(inArray(petPhotos.petId, petIds))
          .orderBy(desc(petPhotos.takenAt))
        : [];
      // Memberships
      const clientMemberships = await db
        .select({
          id: memberships.id,
          name: memberships.name,
          tier: memberships.tier,
          serviceType: memberships.serviceType,
          status: memberships.status,
          pricePerCycle: memberships.pricePerCycle,
          billingCycleWeeks: memberships.billingCycleWeeks,
          nextBillingDate: memberships.nextBillingDate,
          bookingSuspended: memberships.bookingSuspended,
          startedAt: memberships.startedAt,
          cancelledAt: memberships.cancelledAt,
          petId: memberships.petId,
          petName: pets.name,
        })
        .from(memberships)
        .leftJoin(pets, eq(memberships.petId, pets.id))
        .where(eq(memberships.clientId, input.clientId))
        .orderBy(desc(memberships.startedAt));
      const clientPetMembershipEvents = await db
        .select({
          id: petMembershipEvents.id,
          petId: petMembershipEvents.petId,
          membershipId: petMembershipEvents.membershipId,
          replacementPetId: petMembershipEvents.replacementPetId,
          eventType: petMembershipEvents.eventType,
          note: petMembershipEvents.note,
          changedAt: petMembershipEvents.createdAt,
          changedByName: users.name,
        })
        .from(petMembershipEvents)
        .leftJoin(users, eq(petMembershipEvents.changedByUserId, users.id))
        .where(eq(petMembershipEvents.clientId, input.clientId))
        .orderBy(desc(petMembershipEvents.createdAt))
        .limit(100);
      // Appointments (last 100)
      const clientAppointments = await db
        .select({
          id: appointments.id,
          scheduledStart: appointments.scheduledStart,
          scheduledEnd: appointments.scheduledEnd,
          serviceType: appointments.serviceType,
          workflowState: appointments.workflowState,
          status: appointments.status,
          price: appointments.price,
          notes: appointments.notes,
          staffId: appointments.staffId,
          petId: appointments.petId,
          petName: pets.name,
          petBreed: pets.breed,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(eq(appointments.clientId, input.clientId))
        .orderBy(desc(appointments.scheduledStart))
        .limit(100);
      // Membership payments (last 50)
      const membershipIds = clientMemberships.map(m => m.id);
      let payments: { id: number; amount: string; status: string; paidAt: Date | null; membershipName: string | null }[] = [];
      if (membershipIds.length > 0) {
        payments = await db
          .select({
            id: membershipPayments.id,
            amount: membershipPayments.amount,
            status: membershipPayments.status,
            paidAt: membershipPayments.paidAt,
            membershipName: memberships.name,
          })
          .from(membershipPayments)
          .leftJoin(memberships, eq(membershipPayments.membershipId, memberships.id))
          .where(inArray(membershipPayments.membershipId, membershipIds))
          .orderBy(desc(membershipPayments.paidAt))
          .limit(50);
      }
      return { client, contacts: additionalContacts, pets: clientPets, memberships: clientMemberships, appointments: clientAppointments, payments, photos: clientPhotos, petMembershipEvents: clientPetMembershipEvents };
    }),

  addContact: adminProcedure
    .input(z.object({ clientId: z.number(), name: z.string().trim().min(1).max(255), phone: z.string().trim().min(6).max(30), email: z.string().email().optional(), relationship: z.string().trim().max(100).optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [client] = await db.select({ id: clients.id, tenantId: clients.tenantId }).from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client) throw new Error("Client not found");
      const [result] = await db.insert(clientContacts).values({
        tenantId: client.tenantId,
        clientId: client.id,
        name: input.name,
        phone: input.phone,
        email: input.email?.trim() || null,
        relationship: input.relationship?.trim() || null,
      });
      return { id: Number((result as any).insertId) };
    }),

  removeContact: adminProcedure
    .input(z.object({ contactId: z.number(), clientId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [contact] = await db.select({ id: clientContacts.id, clientId: clientContacts.clientId })
        .from(clientContacts)
        .where(and(eq(clientContacts.id, input.contactId), eq(clientContacts.clientId, input.clientId)))
        .limit(1);
      if (!contact) throw new Error("Contact not found for this client");
      await db.delete(clientContacts).where(eq(clientContacts.id, contact.id));
      return { success: true };
    }),
});

// ─── Pets ─────────────────────────────────────────────────────────────────────
const petsRouter = router({
  listByClient: operationalProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff) {
        const [client] = await db.select({ tenantId: clients.tenantId }).from(clients).where(eq(clients.id, input.clientId)).limit(1);
        if (!client || client.tenantId !== portalStaff.tenantId) throw new Error("This client is not available to your salon staff profile");
      }
      return db.select().from(pets).where(eq(pets.clientId, input.clientId));
    }),

  create: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
      name: z.string(),
      breed: z.string().optional(),
      weightKg: z.string().optional(),
      coatType: z.string().optional(),
      colour: z.string().optional(),
      gender: z.enum(["male", "female", "unknown"]).default("unknown"),
      desexed: z.boolean().default(false),
      behaviourNotes: z.string().optional(),
      groomingNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(pets).values(input);
      return { success: true, id: (result as any).insertId as number };
    }),

  updateWeight: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      petId: z.number(),
      weightKg: z.number().finite().min(0).max(80).nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) {
        throw new Error("This pet is not available to your salon staff profile");
      }
      const [pet] = await db.select({ id: pets.id, tenantId: pets.tenantId })
        .from(pets)
        .where(and(eq(pets.id, input.petId), eq(pets.tenantId, input.tenantId)))
        .limit(1);
      if (!pet) throw new Error("Pet not found");
      const recordedWeight = input.weightKg === null ? null : input.weightKg.toFixed(1);
      await db.update(pets).set({ weightKg: recordedWeight, weight: recordedWeight }).where(eq(pets.id, pet.id));
      return { success: true, weightKg: recordedWeight };
    }),

  markDeparted: adminProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      petId: z.number(),
      note: z.string().trim().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [pet] = await db
        .select({ id: pets.id, tenantId: pets.tenantId, clientId: pets.clientId, name: pets.name, status: pets.status })
        .from(pets)
        .where(and(eq(pets.id, input.petId), eq(pets.tenantId, input.tenantId)))
        .limit(1);
      if (!pet) throw new Error("Pet not found");
      if (pet.status === "departed") return { success: true, alreadyRecorded: true, petName: pet.name };

      await db.update(pets).set({ status: "departed", departedAt: new Date() }).where(eq(pets.id, pet.id));
      await db.insert(petMembershipEvents).values({
        tenantId: pet.tenantId,
        clientId: pet.clientId,
        petId: pet.id,
        eventType: "pet_marked_departed",
        note: input.note || null,
        changedByUserId: ctx.user.id,
      });
      return { success: true, alreadyRecorded: false, petName: pet.name };
    }),
});

// ─── Staff ────────────────────────────────────────────────────────────────────
const staffRouter = router({
  listOperational: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This staff directory is not available to your salon staff profile");
      return db.select({
        id: staff.id,
        tenantId: staff.tenantId,
        name: staff.name,
        role: staff.role,
        colourHex: staff.colourHex,
        isActive: staff.isActive,
      }).from(staff).where(eq(staff.tenantId, input.tenantId)).orderBy(asc(staff.name));
    }),

  list: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: staff.id,
        tenantId: staff.tenantId,
        userId: staff.userId,
        name: staff.name,
        email: staff.email,
        phone: staff.phone,
        role: staff.role,
        colourHex: staff.colourHex,
        isActive: staff.isActive,
      }).from(staff).where(eq(staff.tenantId, input.tenantId)).orderBy(asc(staff.name));
    }),

  create: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      name: z.string(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      role: z.enum(["owner", "groomer", "bather", "receptionist", "manager"]).default("groomer"),
      colourHex: z.string().default("#6366f1"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(staff).values(input);
      return { success: true };
    }),

  getProfile: adminProcedure
    .input(z.object({
      staffId: z.number(),
      tenantId: z.number().default(1),
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [member] = await db.select().from(staff).where(and(eq(staff.id, input.staffId), eq(staff.tenantId, input.tenantId))).limit(1);
      if (!member) return null;
      const brisbaneDateKey = (date: Date) => new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(date);
      const addCalendarDays = (dateKey: string, days: number) => {
        const date = new Date(`${dateKey}T12:00:00.000Z`);
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
      };
      const rangeEndDateKey = input.dateTo ?? brisbaneDateKey(new Date());
      const rangeStartDateKey = input.dateFrom ?? addCalendarDays(rangeEndDateKey, -6);
      const rangeStart = new Date(`${rangeStartDateKey}T00:00:00.000+10:00`);
      const rangeEndExclusive = new Date(`${addCalendarDays(rangeEndDateKey, 1)}T00:00:00.000+10:00`);
      if (!Number.isFinite(rangeStart.getTime()) || !Number.isFinite(rangeEndExclusive.getTime()) || rangeStart >= rangeEndExclusive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid performance date range." });
      }
      const rangeDays = Math.floor((Date.parse(`${rangeEndDateKey}T12:00:00.000Z`) - Date.parse(`${rangeStartDateKey}T12:00:00.000Z`)) / (24 * 60 * 60 * 1000)) + 1;
      if (rangeDays > 366) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a date range of one year or less." });
      const dateKey = (date: Date) => date.toISOString().slice(0, 10);
      // Appointment stats
      const apptStats = await db.execute(sql`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN scheduled_start >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last30,
          SUM(CASE WHEN scheduled_start >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as last7
        FROM appointments WHERE staff_id = ${input.staffId} AND tenant_id = ${input.tenantId}
      `);
      const stats = (apptStats as any)[0]?.[0] ?? { total: 0, last30: 0, last7: 0 };
      const reviewThresholdRows = await db.select().from(workflowTimingReviewThresholds).where(eq(workflowTimingReviewThresholds.tenantId, input.tenantId));
      const reviewRules = timingReviewRules(reviewThresholdRows);
      const timingRows = await db.execute(sql`
        SELECT
          AVG(CASE WHEN bath_staff_id = ${input.staffId} AND bathing_started_at IS NOT NULL AND bathing_completed_at IS NOT NULL AND bathing_completed_at >= bathing_started_at THEN FLOOR((bathing_completed_at - bathing_started_at) / 60000) END) AS bath_average_minutes,
          SUM(CASE WHEN bath_staff_id = ${input.staffId} AND bathing_started_at IS NOT NULL AND bathing_completed_at IS NOT NULL AND bathing_completed_at >= bathing_started_at THEN 1 ELSE 0 END) AS bath_completed_count,
          AVG(CASE WHEN dry_staff_id = ${input.staffId} AND drying_started_at IS NOT NULL AND drying_completed_at IS NOT NULL AND drying_completed_at >= drying_started_at THEN FLOOR((drying_completed_at - drying_started_at) / 60000) END) AS dry_average_minutes,
          SUM(CASE WHEN dry_staff_id = ${input.staffId} AND drying_started_at IS NOT NULL AND drying_completed_at IS NOT NULL AND drying_completed_at >= drying_started_at THEN 1 ELSE 0 END) AS dry_completed_count,
          AVG(CASE WHEN staff_id = ${input.staffId} AND grooming_started_at IS NOT NULL AND grooming_completed_at IS NOT NULL AND grooming_completed_at >= grooming_started_at THEN FLOOR((grooming_completed_at - grooming_started_at) / 60000) END) AS groom_average_minutes,
          SUM(CASE WHEN staff_id = ${input.staffId} AND grooming_started_at IS NOT NULL AND grooming_completed_at IS NOT NULL AND grooming_completed_at >= grooming_started_at THEN 1 ELSE 0 END) AS groom_completed_count,
          AVG(CASE WHEN staff_id = ${input.staffId} AND checked_in_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= checked_in_at THEN FLOOR((completed_at - checked_in_at) / 60000) END) AS total_average_minutes,
          SUM(CASE WHEN staff_id = ${input.staffId} AND checked_in_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= checked_in_at THEN 1 ELSE 0 END) AS total_completed_count
        FROM appointments
        WHERE tenant_id = ${input.tenantId}
          AND scheduled_start >= ${rangeStart}
          AND scheduled_start < ${rangeEndExclusive}
          AND status NOT IN ('cancelled', 'no_show')
      `);
      const dailyTimingRows = await db.execute(sql`
        SELECT
          DATE_FORMAT(CONVERT_TZ(scheduled_start, '+00:00', '+10:00'), '%Y-%m-%d') AS date_key,
          AVG(CASE WHEN bath_staff_id = ${input.staffId} AND bathing_started_at IS NOT NULL AND bathing_completed_at IS NOT NULL AND bathing_completed_at >= bathing_started_at THEN FLOOR((bathing_completed_at - bathing_started_at) / 60000) END) AS bath_average_minutes,
          SUM(CASE WHEN bath_staff_id = ${input.staffId} AND bathing_started_at IS NOT NULL AND bathing_completed_at IS NOT NULL AND bathing_completed_at >= bathing_started_at THEN 1 ELSE 0 END) AS bath_completed_count,
          AVG(CASE WHEN dry_staff_id = ${input.staffId} AND drying_started_at IS NOT NULL AND drying_completed_at IS NOT NULL AND drying_completed_at >= drying_started_at THEN FLOOR((drying_completed_at - drying_started_at) / 60000) END) AS dry_average_minutes,
          SUM(CASE WHEN dry_staff_id = ${input.staffId} AND drying_started_at IS NOT NULL AND drying_completed_at IS NOT NULL AND drying_completed_at >= drying_started_at THEN 1 ELSE 0 END) AS dry_completed_count,
          AVG(CASE WHEN staff_id = ${input.staffId} AND grooming_started_at IS NOT NULL AND grooming_completed_at IS NOT NULL AND grooming_completed_at >= grooming_started_at THEN FLOOR((grooming_completed_at - grooming_started_at) / 60000) END) AS groom_average_minutes,
          SUM(CASE WHEN staff_id = ${input.staffId} AND grooming_started_at IS NOT NULL AND grooming_completed_at IS NOT NULL AND grooming_completed_at >= grooming_started_at THEN 1 ELSE 0 END) AS groom_completed_count,
          AVG(CASE WHEN staff_id = ${input.staffId} AND checked_in_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= checked_in_at THEN FLOOR((completed_at - checked_in_at) / 60000) END) AS total_average_minutes,
          SUM(CASE WHEN staff_id = ${input.staffId} AND checked_in_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= checked_in_at THEN 1 ELSE 0 END) AS total_completed_count
        FROM appointments
        WHERE tenant_id = ${input.tenantId}
          AND scheduled_start >= ${rangeStart}
          AND scheduled_start < ${rangeEndExclusive}
          AND status NOT IN ('cancelled', 'no_show')
          AND (bath_staff_id = ${input.staffId} OR dry_staff_id = ${input.staffId} OR staff_id = ${input.staffId})
        GROUP BY DATE_FORMAT(CONVERT_TZ(scheduled_start, '+00:00', '+10:00'), '%Y-%m-%d')
        ORDER BY date_key ASC
      `);
      const reviewFindingRows = await db.execute(sql`
        SELECT
          a.id AS appointment_id,
          DATE_FORMAT(CONVERT_TZ(a.scheduled_start, '+00:00', '+10:00'), '%Y-%m-%d') AS review_date,
          p.name AS pet_name,
          p.breed AS pet_breed,
          p.weight_kg AS pet_weight_kg,
          p.weight AS pet_weight,
          c.first_name AS client_first_name,
          c.last_name AS client_last_name,
          CASE WHEN a.bath_staff_id = ${input.staffId} AND a.bathing_started_at IS NOT NULL AND a.bathing_completed_at IS NOT NULL AND a.bathing_completed_at >= a.bathing_started_at THEN FLOOR((a.bathing_completed_at - a.bathing_started_at) / 60000) END AS bath_minutes,
          CASE WHEN a.dry_staff_id = ${input.staffId} AND a.drying_started_at IS NOT NULL AND a.drying_completed_at IS NOT NULL AND a.drying_completed_at >= a.drying_started_at THEN FLOOR((a.drying_completed_at - a.drying_started_at) / 60000) END AS dry_minutes,
          CASE WHEN a.staff_id = ${input.staffId} AND a.grooming_started_at IS NOT NULL AND a.grooming_completed_at IS NOT NULL AND a.grooming_completed_at >= a.grooming_started_at THEN FLOOR((a.grooming_completed_at - a.grooming_started_at) / 60000) END AS groom_minutes,
          CASE WHEN a.staff_id = ${input.staffId} AND a.checked_in_at IS NOT NULL AND a.completed_at IS NOT NULL AND a.completed_at >= a.checked_in_at THEN FLOOR((a.completed_at - a.checked_in_at) / 60000) END AS total_minutes
        FROM appointments a
        LEFT JOIN pets p ON a.pet_id = p.id
        LEFT JOIN clients c ON a.client_id = c.id
        WHERE a.tenant_id = ${input.tenantId}
          AND a.scheduled_start >= ${rangeStart}
          AND a.scheduled_start < ${rangeEndExclusive}
          AND a.status NOT IN ('cancelled', 'no_show')
          AND (a.bath_staff_id = ${input.staffId} OR a.dry_staff_id = ${input.staffId} OR a.staff_id = ${input.staffId})
        ORDER BY a.scheduled_start DESC
      `);
      const timing = (timingRows as any)[0]?.[0] ?? {};
      const rawDailyTiming = (dailyTimingRows as any)[0] ?? [];
      const minutes = (value: unknown) => value === null || value === undefined ? null : Math.round(Number(value));
      const count = (value: unknown) => Math.max(0, Number(value ?? 0));
      const reviewFindings = ((reviewFindingRows as any)[0] ?? []).flatMap((row: Record<string, unknown>) => {
        const clientName = [row.client_first_name, row.client_last_name].filter(Boolean).join(" ") || "Client";
        const threshold = resolveTimingReviewThreshold({ breed: row.pet_breed as string | null, weightKg: row.pet_weight_kg as string | number | null, weight: row.pet_weight as string | number | null }, reviewRules);
        const stages = [
          { stage: "Bath", durationMinutes: minutes(row.bath_minutes), thresholdMinutes: threshold.thresholds.bathMinutes, recommendation: "Check the bath handover, coat condition and whether the allocated duration or price needs adjustment." },
          { stage: "Dry", durationMinutes: minutes(row.dry_minutes), thresholdMinutes: threshold.thresholds.dryMinutes, recommendation: "Check dryer and table availability, coat condition, and whether an extra drying allowance is needed." },
          { stage: "Groom", durationMinutes: minutes(row.groom_minutes), thresholdMinutes: threshold.thresholds.groomMinutes, recommendation: "Review the groom scope, coat condition, style notes and pricing before the pet’s next appointment." },
          { stage: "Total salon time", durationMinutes: minutes(row.total_minutes), thresholdMinutes: threshold.thresholds.totalMinutes, recommendation: "Review handovers, waiting periods, service scope and pricing before the pet’s next appointment." },
        ];
        return stages
          .filter((stage) => stage.durationMinutes !== null && stage.durationMinutes > stage.thresholdMinutes)
          .map((stage) => ({
            appointmentId: Number(row.appointment_id),
            date: String(row.review_date),
            petName: String(row.pet_name ?? "Pet"),
            clientName,
            thresholdSource: threshold.source,
            ...stage,
          }));
      });
      const dailyByDate = new Map(rawDailyTiming.map((row: any) => [row.date_key, row]));
      const dailyTrend = Array.from({ length: rangeDays }, (_, offset) => {
        const day = new Date(`${rangeStartDateKey}T12:00:00.000Z`);
        day.setUTCDate(day.getUTCDate() + offset);
        const row = dailyByDate.get(dateKey(day)) as Record<string, unknown> | undefined;
        return {
          date: dateKey(day),
          bathAverageMinutes: minutes(row?.bath_average_minutes),
          bathCompletedCount: count(row?.bath_completed_count),
          dryAverageMinutes: minutes(row?.dry_average_minutes),
          dryCompletedCount: count(row?.dry_completed_count),
          groomAverageMinutes: minutes(row?.groom_average_minutes),
          groomCompletedCount: count(row?.groom_completed_count),
          totalAverageMinutes: minutes(row?.total_average_minutes),
          totalCompletedCount: count(row?.total_completed_count),
        };
      });
      return {
        ...member,
        stats,
        timingAnalytics: {
          range: { startDate: rangeStartDateKey, endDate: rangeEndDateKey, days: rangeDays },
          bath: { averageMinutes: minutes(timing.bath_average_minutes), completedCount: count(timing.bath_completed_count) },
          dry: { averageMinutes: minutes(timing.dry_average_minutes), completedCount: count(timing.dry_completed_count) },
          groom: { averageMinutes: minutes(timing.groom_average_minutes), completedCount: count(timing.groom_completed_count) },
          total: { averageMinutes: minutes(timing.total_average_minutes), completedCount: count(timing.total_completed_count) },
          dailyTrend,
          reviewFindings,
        },
      };
    }),

  update: protectedProcedure
    .input(z.object({
      staffId: z.number(),
      name: z.string().optional(),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      dateOfBirth: z.string().optional().nullable(),
      emergencyContact: z.string().optional().nullable(),
      emergencyPhone: z.string().optional().nullable(),
      role: z.enum(["owner", "groomer", "bather", "receptionist", "manager"]).optional(),
      colourHex: z.string().optional(),
      isActive: z.boolean().optional(),
      xeroEmployeeId: z.string().optional().nullable(),
      onlineBookable: z.boolean().optional(),
      onlineProfilePhotoUrl: z.string().optional().nullable(),
      onlineBio: z.string().max(1000).optional().nullable(),
      onlineServices: z.string().optional().nullable(),
      onlineMaxDogsPerSlot: z.number().int().min(1).max(10).optional(),
      onlineMaxDogsPerDay: z.number().int().min(0).max(50).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { staffId, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      if (fields.name !== undefined) updateData.name = fields.name;
      if (fields.email !== undefined) updateData.email = fields.email;
      if (fields.phone !== undefined) updateData.phone = fields.phone;
      if (fields.address !== undefined) updateData.address = fields.address;
      if (fields.notes !== undefined) updateData.notes = fields.notes;
      if (fields.dateOfBirth !== undefined) updateData.dateOfBirth = fields.dateOfBirth;
      if (fields.emergencyContact !== undefined) updateData.emergencyContact = fields.emergencyContact;
      if (fields.emergencyPhone !== undefined) updateData.emergencyPhone = fields.emergencyPhone;
      if (fields.role !== undefined) updateData.role = fields.role;
      if (fields.colourHex !== undefined) updateData.colourHex = fields.colourHex;
      if (fields.isActive !== undefined) updateData.isActive = fields.isActive;
      if (fields.xeroEmployeeId !== undefined) updateData.xeroEmployeeId = fields.xeroEmployeeId;
      if (fields.onlineBookable !== undefined) updateData.onlineBookable = fields.onlineBookable;
      if (fields.onlineProfilePhotoUrl !== undefined) updateData.onlineProfilePhotoUrl = fields.onlineProfilePhotoUrl;
      if (fields.onlineBio !== undefined) updateData.onlineBio = fields.onlineBio;
      if (fields.onlineServices !== undefined) updateData.onlineServices = fields.onlineServices;
      if (fields.onlineMaxDogsPerSlot !== undefined) updateData.onlineMaxDogsPerSlot = fields.onlineMaxDogsPerSlot;
      if (fields.onlineMaxDogsPerDay !== undefined) updateData.onlineMaxDogsPerDay = fields.onlineMaxDogsPerDay;
      await db.update(staff).set(updateData as Parameters<typeof db.update>[0] extends infer T ? any : any).where(eq(staff.id, staffId));
      return { success: true };
    }),

  invitePortalAccount: adminProcedure
    .input(z.object({
      staffId: z.number(),
      email: z.string().email(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [member] = await db.select().from(staff).where(eq(staff.id, input.staffId)).limit(1);
      if (!member) throw new Error("Staff member not found");
      if (member.portalStatus === "approved") throw new Error("This staff member already has approved portal access");
      const email = input.email.trim().toLowerCase();
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      const reusingRevokedAccount = member.portalStatus === "revoked" && isLinkedStaffUser(member.userId, existing?.id);
      if (member.userId && !reusingRevokedAccount) throw new Error("This staff profile is already linked to a different account");
      if (existing && !reusingRevokedAccount) throw new Error("That email address already has a Groomigo account");

      const invitation = createStaffInvitationToken();
      await db.update(staffInvitations).set({ status: "revoked" }).where(and(
        eq(staffInvitations.staffId, member.id),
        eq(staffInvitations.status, "pending"),
      ));
      await db.insert(staffInvitations).values({
        tenantId: member.tenantId,
        staffId: member.id,
        email,
        tokenHash: invitation.tokenHash,
        expiresAt: invitation.expiresAt,
        invitedByUserId: ctx.user.id,
      });
      const [savedInvitation] = await db.select({ id: staffInvitations.id }).from(staffInvitations)
        .where(eq(staffInvitations.tokenHash, invitation.tokenHash)).limit(1);
      if (!savedInvitation) throw new Error("Could not create the staff invitation");
      await db.update(staff).set({ email, portalStatus: "invited" }).where(eq(staff.id, input.staffId));
      await recordStaffAccessEvent(db, {
        tenantId: member.tenantId,
        staffId: member.id,
        invitationId: savedInvitation.id,
        actorUserId: ctx.user.id,
        eventType: "invited",
        note: `Invitation prepared for ${email}`,
      });

      const invitationLink = `https://groomingsos-mqzfsvzv.manus.space/staff-invite/${invitation.token}`;
      const { sendEmail } = await import("./email");
      const emailSent = await sendEmail({
        to: email,
        subject: "You are invited to Groomigo",
        html: `<p>Hi ${member.name},</p><p>You have been invited to Groomigo for your operational staff access.</p><p><a href="${invitationLink}">Set up my staff account</a></p><p>This acceptance link expires in seven days. After setup, your salon administrator will review and approve your access.</p>`,
      });
      return { success: true, email, emailSent, expiresAt: invitation.expiresAt };
    }),

  getInvitation: publicProcedure
    .input(z.object({ token: z.string().length(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const tokenHash = hashStaffInvitationToken(input.token);
      const [invitation] = await db.select({
        id: staffInvitations.id,
        email: staffInvitations.email,
        status: staffInvitations.status,
        expiresAt: staffInvitations.expiresAt,
        staffName: staff.name,
      }).from(staffInvitations).leftJoin(staff, eq(staffInvitations.staffId, staff.id))
        .where(eq(staffInvitations.tokenHash, tokenHash)).limit(1);
      if (!invitation) return null;
      return { ...invitation, expired: isStaffInvitationExpired(invitation.expiresAt) };
    }),

  acceptInvitation: publicProcedure
    .input(z.object({ token: z.string().length(64), password: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const tokenHash = hashStaffInvitationToken(input.token);
      const [invitation] = await db.select().from(staffInvitations).where(eq(staffInvitations.tokenHash, tokenHash)).limit(1);
      if (!invitation || invitation.status !== "pending") throw new Error("This invitation is no longer available");
      if (isStaffInvitationExpired(invitation.expiresAt)) {
        await db.update(staffInvitations).set({ status: "expired" }).where(eq(staffInvitations.id, invitation.id));
        throw new Error("This invitation has expired. Please ask an administrator to send a new invitation.");
      }
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, invitation.email)).limit(1);
      const [member] = await db.select().from(staff).where(eq(staff.id, invitation.staffId)).limit(1);
      if (!member) throw new Error("Staff profile not found");
      const reusingInvitedAccount = member.portalStatus === "invited" && isLinkedStaffUser(member.userId, existing?.id);
      if (existing && !reusingInvitedAccount) throw new Error("That email address already has a Groomigo account");
      const passwordHash = await bcrypt.hash(input.password, 12);
      let accountId: number;
      if (reusingInvitedAccount && existing) {
        await db.update(users).set({
          tenantId: invitation.tenantId,
          name: member.name,
          loginMethod: "password",
          passwordHash,
          role: "staff",
        }).where(eq(users.id, existing.id));
        accountId = existing.id;
      } else {
        await db.insert(users).values({
          openId: `staff_${nanoid(20)}`,
          tenantId: invitation.tenantId,
          name: member.name,
          email: invitation.email,
          loginMethod: "password",
          passwordHash,
          role: "staff",
        });
        const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, invitation.email)).limit(1);
        if (!account) throw new Error("Could not create staff account");
        accountId = account.id;
      }
      await db.update(staffInvitations).set({ status: "accepted", userId: accountId, acceptedAt: new Date() })
        .where(eq(staffInvitations.id, invitation.id));
      await db.update(staff).set({ userId: accountId, portalStatus: "awaiting_approval" }).where(eq(staff.id, member.id));
      await recordStaffAccessEvent(db, {
        tenantId: invitation.tenantId,
        staffId: member.id,
        invitationId: invitation.id,
        actorUserId: accountId,
        eventType: "accepted",
        note: "Staff account setup completed; awaiting administrator approval",
      });
      return { success: true, approvalRequired: true };
    }),

  approveInvitation: adminProcedure
    .input(z.object({ invitationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [invitation] = await db.select().from(staffInvitations).where(eq(staffInvitations.id, input.invitationId)).limit(1);
      if (!invitation || invitation.status !== "accepted" || !invitation.userId) throw new Error("This staff account is not ready for approval");
      const approvedAt = new Date();
      await db.update(staffInvitations).set({ status: "approved", approvedAt, approvedByUserId: ctx.user.id }).where(eq(staffInvitations.id, invitation.id));
      await db.update(staff).set({ portalStatus: "approved" }).where(eq(staff.id, invitation.staffId));
      await recordStaffAccessEvent(db, { tenantId: invitation.tenantId, staffId: invitation.staffId, invitationId: invitation.id, actorUserId: ctx.user.id, eventType: "approved" });
      return { success: true };
    }),

  revokePortalAccess: adminProcedure
    .input(z.object({ staffId: z.number(), note: z.string().max(500).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [member] = await db.select().from(staff).where(eq(staff.id, input.staffId)).limit(1);
      if (!member) throw new Error("Staff member not found");
      await db.update(staff).set({ portalStatus: "revoked" }).where(eq(staff.id, member.id));
      await db.update(staffInvitations).set({ status: "revoked" }).where(and(eq(staffInvitations.staffId, member.id), eq(staffInvitations.status, "approved")));
      await recordStaffAccessEvent(db, { tenantId: member.tenantId, staffId: member.id, actorUserId: ctx.user.id, eventType: "revoked", note: input.note ?? null });
      return { success: true };
    }),

  restorePortalAccess: adminProcedure
    .input(z.object({ staffId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [member] = await db.select().from(staff).where(eq(staff.id, input.staffId)).limit(1);
      if (!member?.userId || member.portalStatus !== "revoked") throw new Error("This staff account cannot be restored");
      await db.update(staff).set({ portalStatus: "approved" }).where(eq(staff.id, member.id));
      await db.update(users).set({ role: "staff" }).where(eq(users.id, member.userId));
      await recordStaffAccessEvent(db, { tenantId: member.tenantId, staffId: member.id, actorUserId: ctx.user.id, eventType: "approved", note: "Previously revoked staff access restored" });
      return { success: true };
    }),

  listPortalInvitations: adminProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: staffInvitations.id,
        staffId: staffInvitations.staffId,
        staffName: staff.name,
        email: staffInvitations.email,
        status: staffInvitations.status,
        expiresAt: staffInvitations.expiresAt,
        acceptedAt: staffInvitations.acceptedAt,
        approvedAt: staffInvitations.approvedAt,
        portalStatus: staff.portalStatus,
      }).from(staffInvitations).leftJoin(staff, eq(staffInvitations.staffId, staff.id))
        .where(eq(staffInvitations.tenantId, input.tenantId)).orderBy(desc(staffInvitations.createdAt));
    }),

  getAccessHistory: adminProcedure
    .input(z.object({ staffId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: staffAccessEvents.id,
        eventType: staffAccessEvents.eventType,
        note: staffAccessEvents.note,
        appointmentId: staffAccessEvents.appointmentId,
        workflowFromState: staffAccessEvents.workflowFromState,
        workflowToState: staffAccessEvents.workflowToState,
        occurredAtMs: staffAccessEvents.occurredAtMs,
        createdAt: staffAccessEvents.createdAt,
        actorName: users.name,
        actorEmail: users.email,
      }).from(staffAccessEvents).leftJoin(users, eq(staffAccessEvents.actorUserId, users.id))
        .where(eq(staffAccessEvents.staffId, input.staffId)).orderBy(desc(staffAccessEvents.createdAt));
    }),

  getMyPortal: operationalProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [member] = await db.select().from(staff).where(eq(staff.userId, ctx.user.id)).limit(1);
      if (ctx.user.role !== "staff" || !member || member.portalStatus !== "approved") {
        throw new Error("Your staff access is awaiting administrator approval");
      }

      const aestNow = new Date(Date.now() + 10 * 60 * 60 * 1000);
      const start = new Date(Date.UTC(aestNow.getUTCFullYear(), aestNow.getUTCMonth(), aestNow.getUTCDate() - 1, 14, 0, 0, 0));
      const end = new Date(Date.UTC(aestNow.getUTCFullYear(), aestNow.getUTCMonth(), aestNow.getUTCDate(), 13, 59, 59, 999));
      const todaysAppointments = await db.select({
        id: appointments.id,
        clientId: appointments.clientId,
        petId: appointments.petId,
        scheduledStart: appointments.scheduledStart,
        scheduledEnd: appointments.scheduledEnd,
        workflowState: appointments.workflowState,
        serviceType: appointments.serviceType,
        notes: appointments.notes,
        petName: pets.name,
        petBreed: pets.breed,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientPhone: clients.phone,
      }).from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(clients, eq(appointments.clientId, clients.id))
        .where(and(
          eq(appointments.tenantId, member.tenantId),
          or(eq(appointments.staffId, member.id), eq(appointments.bathStaffId, member.id), eq(appointments.dryStaffId, member.id)),
          gte(appointments.scheduledStart, start),
          lte(appointments.scheduledStart, end),
          sql`${appointments.status} NOT IN ('cancelled', 'no_show')`,
        ))
        .orderBy(asc(appointments.scheduledStart));
      return { staff: member, appointments: todaysAppointments };
    }),

  getTimesheets: protectedProcedure
    .input(z.object({ staffId: z.number(), dateFrom: z.string(), dateTo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(timesheets)
        .where(and(
          eq(timesheets.staffId, input.staffId),
          gte(timesheets.clockIn, new Date(input.dateFrom)),
          lte(timesheets.clockIn, new Date(input.dateTo))
        ))
        .orderBy(desc(timesheets.clockIn));
    }),

  clockIn: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1), staffId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(timesheets).values({ tenantId: input.tenantId, staffId: input.staffId, clockIn: new Date() });
      return { success: true };
    }),

  clockOut: protectedProcedure
    .input(z.object({ timesheetId: z.number(), breakMinutes: z.number().default(0) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [ts] = await db.select().from(timesheets).where(eq(timesheets.id, input.timesheetId)).limit(1);
      if (!ts) throw new Error("Timesheet not found");
      const clockOut = new Date();
      const totalMinutes = Math.round((clockOut.getTime() - ts.clockIn.getTime()) / 60000) - input.breakMinutes;
      await db.update(timesheets).set({ clockOut, breakMinutes: input.breakMinutes, totalMinutes }).where(eq(timesheets.id, input.timesheetId));
      return { success: true, totalMinutes };
    }),

  // Blockouts
  listBlockouts: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This calendar is not available to your salon staff profile");
      return db
        .select({
          id: staffBlockouts.id,
          staffId: staffBlockouts.staffId,
          staffName: staff.name,
          staffColour: staff.colourHex,
          blockoutDate: staffBlockouts.blockoutDate,
          startTime: staffBlockouts.startTime,
          endTime: staffBlockouts.endTime,
          isFullDay: staffBlockouts.isFullDay,
          reason: staffBlockouts.reason,
        })
        .from(staffBlockouts)
        .leftJoin(staff, eq(staffBlockouts.staffId, staff.id))
        .where(and(
          eq(staffBlockouts.tenantId, input.tenantId),
          gte(staffBlockouts.blockoutDate, new Date(input.dateFrom)),
          lte(staffBlockouts.blockoutDate, new Date(input.dateTo)),
        ))
        .orderBy(asc(staffBlockouts.blockoutDate));
    }),

  createBlockout: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      staffId: z.number(),
      blockoutDate: z.string(), // ISO date string
      isFullDay: z.boolean().default(true),
      startTime: z.string().optional(), // "HH:MM"
      endTime: z.string().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(staffBlockouts).values({
        tenantId: input.tenantId,
        staffId: input.staffId,
        blockoutDate: new Date(input.blockoutDate),
        isFullDay: input.isFullDay,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        reason: input.reason ?? null,
      });
      return { success: true };
    }),

  deleteBlockout: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(staffBlockouts).where(eq(staffBlockouts.id, input.id));
      return { success: true };
    }),
});

// ─── Memberships ──────────────────────────────────────────────────────────────
const membershipsRouter = router({
  list: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      status: z.enum(["active", "paused", "cancelled", "pending_payment", "expired"]).optional(),
      tier: z.enum(["diamond", "platinum", "gold", "silver", "bronze"]).optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
      sortBy: z.enum(["client", "membership", "tier", "price", "nextBilling", "status"]).default("client"),
      sortDir: z.enum(["asc", "desc"]).default("asc"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const conditions = [eq(memberships.tenantId, input.tenantId)];
      if (input.status) conditions.push(eq(memberships.status, input.status));
      if (input.tier) conditions.push(eq(memberships.tier, input.tier));
      if (input.search) {
        const s = `%${input.search}%`;
        conditions.push(sql`(${clients.firstName} LIKE ${s} OR ${clients.lastName} LIKE ${s} OR ${pets.name} LIKE ${s})`);
      }
      const [countRow] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(memberships)
        .leftJoin(clients, eq(memberships.clientId, clients.id))
        .leftJoin(pets, eq(memberships.petId, pets.id))
        .where(and(...conditions));
      const items = await db
        .select({
          id: memberships.id,
          clientId: memberships.clientId,
          name: memberships.name,
          tier: memberships.tier,
          serviceType: memberships.serviceType,
          status: memberships.status,
          pricePerCycle: memberships.pricePerCycle,
          billingCycleWeeks: memberships.billingCycleWeeks,
          appointmentIntervalWeeks: memberships.appointmentIntervalWeeks,
          nextBillingDate: memberships.nextBillingDate,
          failedPaymentCount: memberships.failedPaymentCount,
          bookingSuspended: memberships.bookingSuspended,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientPhone: clients.phone,
          petName: pets.name,
          petBreed: pets.breed,
        })
        .from(memberships)
        .leftJoin(clients, eq(memberships.clientId, clients.id))
        .leftJoin(pets, eq(memberships.petId, pets.id))
        .where(and(...conditions))
        .orderBy((() => {
          const TIER_RANK = sql`CASE ${memberships.tier} WHEN 'diamond' THEN 0 WHEN 'platinum' THEN 1 WHEN 'gold' THEN 2 WHEN 'silver' THEN 3 WHEN 'bronze' THEN 4 ELSE 5 END`;
          const dir = input.sortDir === "desc";
          switch (input.sortBy) {
            case "membership": return dir ? desc(memberships.name) : asc(memberships.name);
            case "tier": return dir ? desc(TIER_RANK) : asc(TIER_RANK);
            case "price": return dir ? desc(memberships.pricePerCycle) : asc(memberships.pricePerCycle);
            case "nextBilling": return dir ? desc(memberships.nextBillingDate) : asc(memberships.nextBillingDate);
            case "status": return dir ? desc(memberships.status) : asc(memberships.status);
            default: return dir ? desc(clients.lastName) : asc(clients.lastName);
          }
        })())
        .limit(input.pageSize).offset((input.page - 1) * input.pageSize);
      return { items, total: Number(countRow?.total ?? 0) };
    }),

  getPackageOptions: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
      petId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) {
        throw new Error("This membership setup is not available to your salon staff profile");
      }
      const [pet] = await db.select({
        id: pets.id,
        clientId: pets.clientId,
        tenantId: pets.tenantId,
        weightKg: pets.weightKg,
        weight: pets.weight,
      }).from(pets).where(and(eq(pets.id, input.petId), eq(pets.tenantId, input.tenantId))).limit(1);
      if (!pet || pet.clientId !== input.clientId) throw new Error("Pet does not belong to the selected client");
      const recordedWeight = pet.weightKg ?? pet.weight;
      const weightBand = getMembershipWeightBand(recordedWeight);
      return {
        recordedWeight,
        weightBand,
        packages: weightBand ? getMembershipPackagesForWeight(recordedWeight) : MEMBERSHIP_PACKAGES,
        weightBands: MEMBERSHIP_WEIGHT_BANDS,
        requiresManualWeightSelection: !weightBand,
      };
    }),

  create: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
      petId: z.number(),
      packageId: z.string().min(1),
      manualWeightClass: z.enum(["small", "small_medium", "medium", "large", "extra_large", "giant"]).optional(),
      paymentGateway: z.enum(["square", "stripe", "cash", "other"]).default("cash"),
      nextBillingDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) {
        throw new Error("This membership setup is not available to your salon staff profile");
      }
      if (portalStaff && (input.paymentGateway !== "cash" || input.nextBillingDate)) {
        throw new Error("Only an administrator can configure payment collection or a billing date");
      }
      const [pet] = await db.select({
        id: pets.id,
        clientId: pets.clientId,
        tenantId: pets.tenantId,
        weightKg: pets.weightKg,
        weight: pets.weight,
      }).from(pets).where(and(eq(pets.id, input.petId), eq(pets.tenantId, input.tenantId))).limit(1);
      if (!pet || pet.clientId !== input.clientId) throw new Error("Pet does not belong to the selected client");
      const membershipPackage = getMembershipPackageById(input.packageId);
      const recordedWeightBand = getMembershipWeightBand(pet.weightKg ?? pet.weight);
      if (recordedWeightBand && input.manualWeightClass && input.manualWeightClass !== recordedWeightBand.id) {
        throw new Error("The selected weight band does not match this dog's recorded weight");
      }
      const selectedWeightClass = recordedWeightBand?.id ?? input.manualWeightClass;
      if (!membershipPackage || !selectedWeightClass || membershipPackage.weightClass !== selectedWeightClass) {
        throw new Error(recordedWeightBand ? "Choose a valid membership package for this dog's recorded weight" : "Choose a membership tier and approved weight band for this dog");
      }
      const [result] = await db.insert(memberships).values({
        tenantId: input.tenantId,
        clientId: input.clientId,
        petId: input.petId,
        name: membershipPackage.name,
        tier: membershipPackage.tier,
        serviceType: membershipPackage.serviceType,
        billingCycleWeeks: 1,
        appointmentIntervalWeeks: membershipPackage.appointmentIntervalWeeks,
        pricePerCycle: membershipPackage.weeklyPrice.toFixed(2),
        paymentGateway: input.paymentGateway,
        nextBillingDate: input.nextBillingDate ? new Date(input.nextBillingDate) : undefined,
        status: "active",
      });
      return { id: (result as any).insertId };
    }),

  manageDepartedPet: adminProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      membershipId: z.number(),
      petId: z.number(),
      action: z.enum(["remove", "transfer"]),
      replacementPetId: z.number().optional(),
      note: z.string().trim().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [membership] = await db
        .select({
          id: memberships.id,
          tenantId: memberships.tenantId,
          clientId: memberships.clientId,
          petId: memberships.petId,
          status: memberships.status,
          petStatus: pets.status,
          petWeightKg: pets.weightKg,
          petWeight: pets.weight,
        })
        .from(memberships)
        .innerJoin(pets, eq(memberships.petId, pets.id))
        .where(and(eq(memberships.id, input.membershipId), eq(memberships.tenantId, input.tenantId)))
        .limit(1);
      if (!membership || membership.petId !== input.petId) throw new Error("Membership and pet do not match");
      if (membership.petStatus !== "departed") throw new Error("Record the pet as passed away before changing its membership");
      if (membership.status === "cancelled" || membership.status === "expired") throw new Error("This membership is already closed");

      if (input.action === "remove") {
        await db.update(memberships).set({
          status: "cancelled",
          cancelledAt: new Date(),
          nextBillingDate: null,
          paymentRetryScheduledAt: null,
          bookingSuspended: true,
        }).where(eq(memberships.id, membership.id));
        await db.insert(petMembershipEvents).values({
          tenantId: membership.tenantId,
          clientId: membership.clientId,
          petId: membership.petId,
          membershipId: membership.id,
          eventType: "membership_removed",
          note: input.note || null,
          changedByUserId: ctx.user.id,
        });
        return { success: true, action: "removed" as const, membershipId: membership.id };
      }

      if (!input.replacementPetId) throw new Error("Select a replacement pet before transferring this membership");
      const [replacementPet] = await db
        .select({
          id: pets.id,
          clientId: pets.clientId,
          name: pets.name,
          status: pets.status,
          weightKg: pets.weightKg,
          weight: pets.weight,
        })
        .from(pets)
        .where(and(eq(pets.id, input.replacementPetId), eq(pets.tenantId, input.tenantId)))
        .limit(1);
      if (!replacementPet || replacementPet.clientId !== membership.clientId || replacementPet.status !== "active") {
        throw new Error("Choose an active pet belonging to the same client");
      }
      const departedCandidate = { id: membership.petId, weightKg: membership.petWeightKg, weight: membership.petWeight, status: "departed" as const };
      if (!isEligibleMembershipReplacement(departedCandidate, replacementPet)) {
        const membershipBand = getReplacementWeightBand(departedCandidate)?.label ?? "unrecorded";
        const replacementBand = getReplacementWeightBand(replacementPet)?.label ?? "unrecorded";
        throw new Error(`Replacement must be in the same weight band. This membership is ${membershipBand}; the selected pet is ${replacementBand}.`);
      }
      await db.update(memberships).set({ petId: replacementPet.id }).where(eq(memberships.id, membership.id));
      await db.insert(petMembershipEvents).values({
        tenantId: membership.tenantId,
        clientId: membership.clientId,
        petId: membership.petId,
        membershipId: membership.id,
        replacementPetId: replacementPet.id,
        eventType: "membership_transferred",
        note: input.note || null,
        changedByUserId: ctx.user.id,
      });
      return { success: true, action: "transferred" as const, membershipId: membership.id, replacementPetName: replacementPet.name };
    }),

  searchClients: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), search: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && input.tenantId !== portalStaff.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Client search is limited to your salon" });
      }
      if (input.search.length < 1) return [];
      const s = `%${input.search}%`;
      const tenantId = portalStaff?.tenantId ?? input.tenantId;
      const rows = await db
        .select({
          clientId: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
          phone: clients.phone,
          petId: pets.id,
          petName: pets.name,
          petBreed: pets.breed,
        })
        .from(clients)
        .leftJoin(pets, eq(pets.clientId, clients.id))
        .where(and(
          eq(clients.tenantId, tenantId),
          sql`(
            ${clients.firstName} LIKE ${s}
            OR ${clients.lastName} LIKE ${s}
            OR CONCAT(${clients.firstName}, ' ', ${clients.lastName}) LIKE ${s}
            OR ${clients.phone} LIKE ${s}
            OR ${pets.name} LIKE ${s}
          )`
        ))
        .orderBy(asc(clients.firstName))
        .limit(30);
      return rows;
    }),

  getFailedPayments: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          membershipId: memberships.id,
          membershipName: memberships.name,
          failedCount: memberships.failedPaymentCount,
          lastFailedAt: memberships.lastFailedPaymentAt,
          suspended: memberships.bookingSuspended,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientPhone: clients.phone,
          petName: pets.name,
        })
        .from(memberships)
        .leftJoin(clients, eq(memberships.clientId, clients.id))
        .leftJoin(pets, eq(memberships.petId, pets.id))
        .where(and(
          eq(memberships.tenantId, input.tenantId),
          sql`${memberships.failedPaymentCount} > 0`
        ))
        .orderBy(desc(memberships.lastFailedPaymentAt));
    }),

  // Debt tracking: for each active membership, count paid billing cycles vs. completed grooms
  getDebtSummary: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Get all active memberships with client/pet info
      const activeMemberships = await db
        .select({
          id: memberships.id,
          name: memberships.name,
          tier: memberships.tier,
          serviceType: memberships.serviceType,
          pricePerCycle: memberships.pricePerCycle,
          billingCycleWeeks: memberships.billingCycleWeeks,
          status: memberships.status,
          startedAt: memberships.startedAt,
          clientId: memberships.clientId,
          petId: memberships.petId,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientPhone: clients.phone,
          petName: pets.name,
        })
        .from(memberships)
        .leftJoin(clients, eq(memberships.clientId, clients.id))
        .leftJoin(pets, eq(memberships.petId, pets.id))
        .where(and(
          eq(memberships.tenantId, input.tenantId),
          sql`${memberships.status} IN ('active', 'paused', 'pending_payment')`
        ));

      // For each membership, count paid cycles and completed grooms
      const results = await Promise.all(activeMemberships.map(async (m) => {
        const [paidRow] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(membershipPayments)
          .where(and(
            eq(membershipPayments.membershipId, m.id),
            eq(membershipPayments.status, "paid")
          ));
        const [groomRow] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(appointments)
          .where(and(
            eq(appointments.membershipId, m.id),
            sql`${appointments.workflowState} IN ('complete', 'ready')`
          ));
        const paidCycles = Number(paidRow?.count ?? 0);
        const groomsDelivered = Number(groomRow?.count ?? 0);
        const debtGrooms = Math.max(0, paidCycles - groomsDelivered);
        const debtAmount = debtGrooms * parseFloat(m.pricePerCycle ?? "0");
        return {
          ...m,
          paidCycles,
          groomsDelivered,
          debtGrooms,
          debtAmount,
        };
      }));
      return results.filter(r => r.debtGrooms > 0 || r.paidCycles > 0);
    }),

  generateDebtInvoice: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      membershipId: z.number(),
      debtGrooms: z.number(),
      pricePerGroom: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [m] = await db
        .select({ clientId: memberships.clientId, name: memberships.name })
        .from(memberships)
        .where(eq(memberships.id, input.membershipId))
        .limit(1);
      if (!m) throw new Error("Membership not found");
      const subtotal = (input.debtGrooms * parseFloat(input.pricePerGroom)).toFixed(2);
      const invNum = `DEBT-${Date.now().toString(36).toUpperCase()}`;
      const [result] = await db.insert(invoices).values({
        tenantId: input.tenantId,
        clientId: m.clientId,
        invoiceNumber: invNum,
        subtotal,
        taxAmount: "0",
        total: subtotal,
        status: "draft",
        notes: `Membership debt: ${input.debtGrooms} outstanding groom(s) for "${m.name}"`,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const invoiceId = (result as any).insertId;
      await db.insert(invoiceLineItems).values({
        invoiceId,
        description: `Outstanding grooms owed — ${m.name} (${input.debtGrooms} × $${input.pricePerGroom})`,
        quantity: String(input.debtGrooms),
        unitPrice: input.pricePerGroom,
        lineTotal: subtotal,
      });
      return { success: true, invoiceNumber: invNum };
    }),

  recordPaymentFailure: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      membershipId: z.number(),
      failureReason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Fetch membership with client/pet/tenant info
      const [row] = await db
        .select({
          id: memberships.id,
          name: memberships.name,
          pricePerCycle: memberships.pricePerCycle,
          failedPaymentCount: memberships.failedPaymentCount,
          clientId: memberships.clientId,
          petId: memberships.petId,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientEmail: clients.email,
          petName: pets.name,
          tenantName: tenants.name,
          tenantPhone: tenants.phone,
          tenantEmail: tenants.email,
        })
        .from(memberships)
        .leftJoin(clients, eq(memberships.clientId, clients.id))
        .leftJoin(pets, eq(memberships.petId, pets.id))
        .leftJoin(tenants, eq(memberships.tenantId, tenants.id))
        .where(eq(memberships.id, input.membershipId))
        .limit(1);
      if (!row) throw new Error("Membership not found");

      const newFailCount = (row.failedPaymentCount ?? 0) + 1;

      // Calculate next business day for retry
      const retryDate = new Date();
      retryDate.setDate(retryDate.getDate() + 1);
      while (retryDate.getDay() === 0 || retryDate.getDay() === 6) {
        retryDate.setDate(retryDate.getDate() + 1);
      }

      // Update membership: increment failure count, set retry date, suspend on 2nd failure
      await db.update(memberships).set({
        failedPaymentCount: newFailCount,
        lastFailedPaymentAt: new Date(),
        status: "pending_payment",
        paymentRetryScheduledAt: retryDate,
        bookingSuspended: newFailCount >= 2,
      }).where(eq(memberships.id, input.membershipId));

      // Insert failed payment record
      await db.insert(membershipPayments).values({
        membershipId: input.membershipId,
        amount: row.pricePerCycle ?? "0",
        status: "failed",
        failureReason: input.failureReason ?? "Payment declined",
      });

      const retryDateStr = retryDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const { sendEmail, buildAdminFailedPaymentEmail, buildClientFailedPaymentEmail } = await import("./email.js");

      // Always notify admin
      const adminHtml = buildAdminFailedPaymentEmail({
        clientName: `${row.clientFirstName ?? ""} ${row.clientLastName ?? ""}`.trim(),
        petName: row.petName ?? "Unknown pet",
        membershipName: row.name,
        pricePerCycle: parseFloat(row.pricePerCycle ?? "0").toFixed(2),
        failedPaymentCount: newFailCount,
        retryDate: retryDateStr,
      });
      if (row.tenantEmail) {
        await sendEmail({
          to: row.tenantEmail,
          subject: `⚠️ Membership Payment Failed — ${row.clientFirstName} ${row.clientLastName} (${row.petName})`,
          html: adminHtml,
        });
      }
      await notifyOwner({
        title: `Payment Failed: ${row.clientFirstName} ${row.clientLastName} — ${row.name}`,
        content: `Failure #${newFailCount}. Retry scheduled for ${retryDateStr}. Amount: $${parseFloat(row.pricePerCycle ?? "0").toFixed(2)}/wk.`,
      }).catch(() => {});

      // On 2nd failure: email the client
      if (newFailCount >= 2 && row.clientEmail) {
        const clientHtml = buildClientFailedPaymentEmail({
          clientFirstName: row.clientFirstName ?? "Valued Client",
          petName: row.petName ?? "your pet",
          membershipName: row.name,
          pricePerCycle: parseFloat(row.pricePerCycle ?? "0").toFixed(2),
          businessName: row.tenantName ?? "Barkin\' Beautiful Grooming Studio",
          businessPhone: row.tenantPhone,
          businessEmail: row.tenantEmail,
        });
        await sendEmail({
          to: row.clientEmail,
          subject: `Important: Your membership payment could not be processed — ${row.name}`,
          html: clientHtml,
        });
      }

      return { success: true, failedPaymentCount: newFailCount, retryDate: retryDate.toISOString(), suspended: newFailCount >= 2 };
    }),

  resolvePaymentFailure: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      membershipId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(memberships).set({
        failedPaymentCount: 0,
        lastFailedPaymentAt: null,
        paymentRetryScheduledAt: null,
        status: "active",
        bookingSuspended: false,
      }).where(eq(memberships.id, input.membershipId));
      return { success: true };
    }),

  markDebtPaid: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      membershipId: z.number(),
      debtGrooms: z.number(),
      pricePerGroom: z.string(),
      paymentMethod: z.enum(["cash", "eftpos", "bank_transfer", "square"]).default("cash"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [m] = await db
        .select({ id: memberships.id, name: memberships.name, pricePerCycle: memberships.pricePerCycle })
        .from(memberships)
        .where(eq(memberships.id, input.membershipId))
        .limit(1);
      if (!m) throw new Error("Membership not found");
      const amount = (input.debtGrooms * parseFloat(input.pricePerGroom)).toFixed(2);
      // Insert one paid payment record per owed groom to balance the books
      const paymentRows = Array.from({ length: input.debtGrooms }, () => ({
        membershipId: input.membershipId,
        amount: input.pricePerGroom,
        status: "paid" as const,
        gatewayPaymentId: `MANUAL-${Date.now().toString(36).toUpperCase()}`,
        paidAt: new Date(),
      }));
      await db.insert(membershipPayments).values(paymentRows);
      return { success: true, clearedGrooms: input.debtGrooms, totalAmount: amount };
    }),

  getAccountsReceivable: adminProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        id: memberships.id,
        clientId: memberships.clientId,
        petId: memberships.petId,
        name: memberships.name,
        tier: memberships.tier,
        membershipStatus: memberships.status,
        failedPaymentCount: memberships.failedPaymentCount,
        bookingSuspended: memberships.bookingSuspended,
        startedAt: memberships.startedAt,
        cancelledAt: memberships.cancelledAt,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientPhone: clients.phone,
        petName: pets.name,
      }).from(memberships)
        .innerJoin(clients, eq(memberships.clientId, clients.id))
        .innerJoin(pets, eq(memberships.petId, pets.id))
        .where(eq(memberships.tenantId, input.tenantId));

      return Promise.all(rows.map(async (membership) => {
        const [paymentStats] = await db.select({
          amount: sql<number>`COALESCE(SUM(CASE WHEN ${membershipPayments.status} = 'paid' THEN ${membershipPayments.amount} ELSE 0 END), 0)`,
          count: sql<number>`COALESCE(SUM(CASE WHEN ${membershipPayments.status} = 'paid' THEN 1 ELSE 0 END), 0)`,
        }).from(membershipPayments).where(eq(membershipPayments.membershipId, membership.id));
        const grooms = await db.select({ id: appointments.id, price: appointments.price, scheduledStart: appointments.scheduledStart })
          .from(appointments)
          .where(and(
            eq(appointments.clientId, membership.clientId),
            eq(appointments.petId, membership.petId),
            eq(appointments.workflowState, "complete"),
            gte(appointments.scheduledStart, membership.startedAt),
          ));
        const ledger = await db.select({ entryType: membershipLedgerEntries.entryType, amount: membershipLedgerEntries.amount, appointmentId: membershipLedgerEntries.appointmentId })
          .from(membershipLedgerEntries).where(eq(membershipLedgerEntries.membershipId, membership.id));
        const ledgerPaymentAmount = ledger.filter(entry => entry.entryType === "payment" || entry.entryType === "credit_adjustment").reduce((sum, entry) => sum + Number(entry.amount), 0);
        const ledgerPaymentRows = ledger.filter(entry => entry.entryType === "payment" || entry.entryType === "credit_adjustment").length;
        const ledgerGroomValue = ledger.filter(entry => entry.entryType === "groom_value" || entry.entryType === "debit_adjustment").reduce((sum, entry) => sum + Number(entry.amount), 0);
        const appointmentGroomValue = grooms.reduce((sum, groom) => sum + Math.max(0, Number(groom.price ?? 0)), 0);
        const groomIdsWithLedgerValue = new Set(ledger.filter(entry => (entry.entryType === "groom_value" || entry.entryType === "debit_adjustment") && entry.appointmentId).map(entry => entry.appointmentId));
        const unvaluedGrooms = grooms.filter(groom => Number(groom.price ?? 0) <= 0 && !groomIdsWithLedgerValue.has(groom.id));
        const unvaluedCompletedGrooms = unvaluedGrooms.length;
        const account = calculateMembershipAccount({
          membershipStatus: membership.membershipStatus,
          failedPaymentCount: membership.failedPaymentCount,
          bookingSuspended: membership.bookingSuspended,
          paymentAmount: Number(paymentStats?.amount ?? 0),
          ledgerPaymentAmount,
          appointmentGroomValue,
          ledgerGroomValue,
          unvaluedCompletedGrooms,
        });
        const [openInvoice] = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status })
          .from(invoices).where(and(eq(invoices.membershipId, membership.id), sql`${invoices.status} IN ('draft', 'sent', 'overdue')`)).limit(1);
        return {
          ...membership,
          paidPaymentRows: Number(paymentStats?.count ?? 0),
          ledgerPaymentRows,
          completedGrooms: grooms.length,
          unvaluedGrooms: unvaluedGrooms.map(groom => ({ id: groom.id, scheduledStart: groom.scheduledStart })),
          openInvoice: openInvoice ?? null,
          ...account,
        };
      }));
    }),

  recordCompletedGroomValue: adminProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      membershipId: z.number(),
      appointmentId: z.number(),
      amount: z.number().positive().max(10000),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [appointment] = await db.select({ id: appointments.id, clientId: appointments.clientId, petId: appointments.petId, workflowState: appointments.workflowState })
        .from(appointments).where(eq(appointments.id, input.appointmentId)).limit(1);
      const [membership] = await db.select({ id: memberships.id, clientId: memberships.clientId, petId: memberships.petId })
        .from(memberships).where(and(eq(memberships.id, input.membershipId), eq(memberships.tenantId, input.tenantId))).limit(1);
      if (!membership || !appointment || appointment.workflowState !== "complete" || appointment.clientId !== membership.clientId || appointment.petId !== membership.petId) throw new Error("This completed groom does not belong to the selected membership");
      const [existing] = await db.select({ id: membershipLedgerEntries.id }).from(membershipLedgerEntries)
        .where(and(eq(membershipLedgerEntries.membershipId, input.membershipId), eq(membershipLedgerEntries.appointmentId, input.appointmentId), eq(membershipLedgerEntries.entryType, "groom_value"))).limit(1);
      if (existing) throw new Error("A delivered-groom value has already been recorded for this appointment");
      await db.insert(membershipLedgerEntries).values({
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        appointmentId: input.appointmentId,
        entryType: "groom_value",
        amount: input.amount.toFixed(2),
        source: "manual",
        note: input.note || "Delivered groom value recorded for membership reconciliation",
        occurredAt: new Date(),
        createdByUserId: ctx.user.id,
      });
      return { success: true };
    }),

  recordMembershipPayment: adminProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      membershipId: z.number(),
      amount: z.number().positive().max(10000),
      source: z.enum(["stripe", "moego_import", "manual", "cash"]).default("manual"),
      occurredAt: z.string().datetime().optional(),
      externalReference: z.string().max(255).optional(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [membership] = await db.select({ id: memberships.id }).from(memberships)
        .where(and(eq(memberships.id, input.membershipId), eq(memberships.tenantId, input.tenantId))).limit(1);
      if (!membership) throw new Error("Membership not found");
      await db.insert(membershipLedgerEntries).values({
        tenantId: input.tenantId,
        membershipId: membership.id,
        entryType: "payment",
        amount: input.amount.toFixed(2),
        source: input.source,
        externalReference: input.externalReference,
        note: input.note || "Verified membership payment recorded for reconciliation",
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        createdByUserId: ctx.user.id,
      });
      return { success: true };
    }),

  setBookingReviewHold: adminProcedure
    .input(z.object({ tenantId: z.number().default(1), membershipId: z.number(), hold: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [membership] = await db.select({ id: memberships.id }).from(memberships)
        .where(and(eq(memberships.id, input.membershipId), eq(memberships.tenantId, input.tenantId))).limit(1);
      if (!membership) throw new Error("Membership not found");
      await db.update(memberships).set({ bookingSuspended: input.hold }).where(eq(memberships.id, membership.id));
      return { success: true, hold: input.hold };
    }),

  createArrearsInvoice: adminProcedure
    .input(z.object({ tenantId: z.number().default(1), membershipId: z.number(), dueInDays: z.number().min(1).max(60).default(7) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [membership] = await db.select({
        id: memberships.id, clientId: memberships.clientId, petId: memberships.petId, name: memberships.name, startedAt: memberships.startedAt,
      }).from(memberships).where(and(eq(memberships.id, input.membershipId), eq(memberships.tenantId, input.tenantId))).limit(1);
      if (!membership) throw new Error("Membership not found");
      const [openInvoice] = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices)
        .where(and(eq(invoices.membershipId, membership.id), sql`${invoices.status} IN ('draft', 'sent', 'overdue')`)).limit(1);
      if (openInvoice) throw new Error(`An open membership arrears invoice already exists: ${openInvoice.invoiceNumber}`);
      const [payments] = await db.select({ amount: sql<number>`COALESCE(SUM(CASE WHEN ${membershipPayments.status} = 'paid' THEN ${membershipPayments.amount} ELSE 0 END), 0)` })
        .from(membershipPayments).where(eq(membershipPayments.membershipId, membership.id));
      const grooms = await db.select({ id: appointments.id, price: appointments.price }).from(appointments)
        .where(and(eq(appointments.clientId, membership.clientId), eq(appointments.petId, membership.petId), eq(appointments.workflowState, "complete"), gte(appointments.scheduledStart, membership.startedAt)));
      const ledger = await db.select({ entryType: membershipLedgerEntries.entryType, amount: membershipLedgerEntries.amount, appointmentId: membershipLedgerEntries.appointmentId })
        .from(membershipLedgerEntries).where(eq(membershipLedgerEntries.membershipId, membership.id));
      const ledgerPaymentAmount = ledger.filter(entry => entry.entryType === "payment" || entry.entryType === "credit_adjustment").reduce((sum, entry) => sum + Number(entry.amount), 0);
      const ledgerGroomValue = ledger.filter(entry => entry.entryType === "groom_value" || entry.entryType === "debit_adjustment").reduce((sum, entry) => sum + Number(entry.amount), 0);
      const groomIdsWithLedgerValue = new Set(ledger.filter(entry => (entry.entryType === "groom_value" || entry.entryType === "debit_adjustment") && entry.appointmentId).map(entry => entry.appointmentId));
      const unvaluedCompletedGrooms = grooms.filter(groom => Number(groom.price ?? 0) <= 0 && !groomIdsWithLedgerValue.has(groom.id)).length;
      const account = calculateMembershipAccount({ membershipStatus: "active", failedPaymentCount: 0, bookingSuspended: false, paymentAmount: Number(payments?.amount ?? 0), ledgerPaymentAmount, appointmentGroomValue: grooms.reduce((sum, groom) => sum + Math.max(0, Number(groom.price ?? 0)), 0), ledgerGroomValue, unvaluedCompletedGrooms });
      if (!account.invoiceReady) throw new Error(`Record a value for ${account.unvaluedCompletedGrooms} completed groom(s) before preparing an arrears invoice`);
      if (account.arrearsAmount <= 0) throw new Error("This membership has no invoicable arrears");
      const invoiceNumber = `MEM-AR-${Date.now().toString(36).toUpperCase()}`;
      const dueAt = new Date(Date.now() + input.dueInDays * 24 * 60 * 60 * 1000);
      const [result] = await db.insert(invoices).values({ tenantId: input.tenantId, clientId: membership.clientId, membershipId: membership.id, invoiceNumber, subtotal: account.arrearsAmount.toFixed(2), taxAmount: "0", total: account.arrearsAmount.toFixed(2), status: "draft", dueAt, notes: `Membership arrears draft. Paid to date: $${account.paidToDate.toFixed(2)}. Completed groom value: $${account.groomValueDelivered.toFixed(2)}. Prepared for staff review; not sent automatically.` });
      const invoiceId = Number((result as { insertId: number }).insertId);
      await db.insert(invoiceLineItems).values({ invoiceId, description: `Membership arrears — ${membership.name}`, quantity: "1", unitPrice: account.arrearsAmount.toFixed(2), lineTotal: account.arrearsAmount.toFixed(2) });
      await db.insert(membershipLedgerEntries).values({ tenantId: input.tenantId, membershipId: membership.id, invoiceId, entryType: "debit_adjustment", amount: "0.00", source: "system", note: `Draft arrears invoice ${invoiceNumber} prepared by staff; no charge or client message sent.`, occurredAt: new Date(), createdByUserId: ctx.user.id });
      return { success: true, invoiceNumber, invoiceId, total: account.arrearsAmount };
    }),
});

// ─── Retail ───────────────────────────────────────────────────────────────────
const pricingServiceInput = z.object({
  tenantId: z.number().int().positive().default(1),
  catalogueType: z.enum(["service", "add_on"]),
  name: z.string().trim().min(1).max(255),
  code: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional(),
  priceMode: z.enum(["fixed", "range", "from", "quote"]).default("fixed"),
  priceAud: z.coerce.number().finite().min(0).max(100000).optional(),
  priceMaxAud: z.coerce.number().finite().min(0).max(100000).optional(),
  durationMinutes: z.coerce.number().int().positive().max(1440).optional(),
  legacyServiceType: z.string().trim().max(50).optional(),
  weightBand: z.string().trim().max(80).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

const membershipPlanInput = z.object({
  tenantId: z.number().int().positive().default(1),
  name: z.string().trim().min(1).max(255),
  code: z.string().trim().min(1).max(80),
  tier: z.string().trim().min(1).max(50),
  serviceVariant: z.string().trim().max(80).optional(),
  weightBand: z.string().trim().max(80).optional(),
  weeklyPriceAud: z.coerce.number().finite().min(0).max(100000),
  billingCycleWeeks: z.coerce.number().int().positive().max(104).default(1),
  appointmentIntervalWeeks: z.coerce.number().int().positive().max(104),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

const pricingRouter = router({
  listServices: adminProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(pricingServices)
        .where(eq(pricingServices.tenantId, input.tenantId))
        .orderBy(asc(pricingServices.catalogueType), asc(pricingServices.sortOrder), asc(pricingServices.name));
    }),
  createService: adminProcedure
    .input(pricingServiceInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      assertPricingServiceAmount(input);
      await db.insert(pricingServices).values({
        ...input,
        code: normalisePricingCode(input.code),
        description: input.description || null,
        legacyServiceType: input.legacyServiceType || null,
        weightBand: input.weightBand || null,
        durationMinutes: input.durationMinutes ?? null,
        priceAud: input.priceAud === undefined ? null : input.priceAud.toFixed(2),
        priceMaxAud: input.priceMaxAud === undefined ? null : input.priceMaxAud.toFixed(2),
      });
      return { success: true };
    }),
  updateService: adminProcedure
    .input(pricingServiceInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, tenantId, ...values } = input;
      assertPricingServiceAmount(values);
      const result = await db.update(pricingServices).set({
        ...values,
        code: normalisePricingCode(values.code),
        description: values.description || null,
        legacyServiceType: values.legacyServiceType || null,
        weightBand: values.weightBand || null,
        durationMinutes: values.durationMinutes ?? null,
        priceAud: values.priceAud === undefined ? null : values.priceAud.toFixed(2),
        priceMaxAud: values.priceMaxAud === undefined ? null : values.priceMaxAud.toFixed(2),
      }).where(and(eq(pricingServices.id, id), eq(pricingServices.tenantId, tenantId)));
      if (result[0].affectedRows !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      return { success: true };
    }),
  deleteService: adminProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1), id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db.delete(pricingServices).where(and(eq(pricingServices.id, input.id), eq(pricingServices.tenantId, input.tenantId)));
      if (result[0].affectedRows !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      return { success: true };
    }),
  listMembershipPlans: adminProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(membershipPlans)
        .where(eq(membershipPlans.tenantId, input.tenantId))
        .orderBy(asc(membershipPlans.sortOrder), asc(membershipPlans.name));
    }),
  createMembershipPlan: adminProcedure
    .input(membershipPlanInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.insert(membershipPlans).values({
        ...input,
        code: normalisePricingCode(input.code),
        serviceVariant: input.serviceVariant || null,
        weightBand: input.weightBand || null,
        description: input.description || null,
        weeklyPriceAud: input.weeklyPriceAud.toFixed(2),
      });
      return { success: true };
    }),
  updateMembershipPlan: adminProcedure
    .input(membershipPlanInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, tenantId, ...values } = input;
      const result = await db.update(membershipPlans).set({
        ...values,
        code: normalisePricingCode(values.code),
        serviceVariant: values.serviceVariant || null,
        weightBand: values.weightBand || null,
        description: values.description || null,
        weeklyPriceAud: values.weeklyPriceAud.toFixed(2),
      }).where(and(eq(membershipPlans.id, id), eq(membershipPlans.tenantId, tenantId)));
      if (result[0].affectedRows !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Membership plan not found" });
      return { success: true };
    }),
  deleteMembershipPlan: adminProcedure
    .input(z.object({ tenantId: z.number().int().positive().default(1), id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db.delete(membershipPlans).where(and(eq(membershipPlans.id, input.id), eq(membershipPlans.tenantId, input.tenantId)));
      if (result[0].affectedRows !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Membership plan not found" });
      return { success: true };
  }),
});

function assertPricingServiceAmount(input: { priceMode: "fixed" | "range" | "from" | "quote"; priceAud?: number; priceMaxAud?: number }) {
  const message = getPricingAmountValidationError(input);
  if (message) throw new TRPCError({ code: "BAD_REQUEST", message });
}

const retailRouter = router({
  list: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1), search: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(retailProducts.tenantId, input.tenantId), eq(retailProducts.isActive, true)];
      if (input.search) conditions.push(like(retailProducts.name, `%${input.search}%`));
      return db.select().from(retailProducts).where(and(...conditions)).orderBy(asc(retailProducts.name));
    }),

  create: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      name: z.string(),
      sku: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      priceAud: z.string(),
      costAud: z.string().optional(),
      stockQty: z.number().default(0),
      reorderThreshold: z.number().default(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(retailProducts).values(input);
      return { success: true };
    }),
});

// ─── Analytics ────────────────────────────────────────────────────────────────
const analyticsRouter = router({
  averageGroomInterval: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { averageWeeks: null, medianWeeks: null, intervalCount: 0, returningPetCount: 0 };

      const completedVisits = await db
        .select({ petId: appointments.petId, scheduledStart: appointments.scheduledStart })
        .from(appointments)
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          eq(appointments.workflowState, "complete"),
          sql`${appointments.petId} IS NOT NULL`
        ));

      return calculateGroomIntervalStats(completedVisits);
    }),

  summary: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1), dateFrom: z.string(), dateTo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [revenueRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${appointments.price}), 0)` })
        .from(appointments)
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          eq(appointments.workflowState, "complete"),
          gte(appointments.scheduledStart, new Date(input.dateFrom)),
          lte(appointments.scheduledStart, new Date(input.dateTo))
        ));
      const [apptCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(appointments)
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          gte(appointments.scheduledStart, new Date(input.dateFrom)),
          lte(appointments.scheduledStart, new Date(input.dateTo))
        ));
      const [membershipCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(memberships)
        .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.status, "active")));
      const [clientCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(clients)
        .where(and(eq(clients.tenantId, input.tenantId), eq(clients.status, "active")));
      return {
        revenue: parseFloat(revenueRow?.total ?? "0"),
        appointments: apptCount?.count ?? 0,
        activeMemberships: membershipCount?.count ?? 0,
        activeClients: clientCount?.count ?? 0,
      };
    }),

  membershipBreakdown: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { tiers: [], totalWeeklyRevenue: 0, totalMonthlyRevenue: 0 };

      // Get all active memberships with client and pet info
      const rows = await db
        .select({
          tier: memberships.tier,
          name: memberships.name,
          pricePerCycle: memberships.pricePerCycle,
          billingCycleWeeks: memberships.billingCycleWeeks,
          clientName: clients.firstName,
          clientLastName: clients.lastName,
        })
        .from(memberships)
        .leftJoin(clients, eq(memberships.clientId, clients.id))
        .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.status, "active")));

      // Group by tier
      const tierMap: Record<string, { count: number; weeklyRevenue: number; names: string[] }> = {};
      let totalWeeklyRevenue = 0;

      for (const row of rows) {
        const tier = row.tier ?? "unknown";
        const pricePerCycle = parseFloat(row.pricePerCycle ?? "0");
        const cycleWeeks = row.billingCycleWeeks ?? 1;
        // Normalise to weekly rate
        const weeklyRate = cycleWeeks > 0 ? pricePerCycle / cycleWeeks : pricePerCycle;

        if (!tierMap[tier]) tierMap[tier] = { count: 0, weeklyRevenue: 0, names: [] };
        tierMap[tier].count++;
        tierMap[tier].weeklyRevenue += weeklyRate;
        const clientName = [row.clientName, row.clientLastName].filter(Boolean).join(" ");
        if (tierMap[tier].names.length < 3) tierMap[tier].names.push(clientName);
        totalWeeklyRevenue += weeklyRate;
      }

      const TIER_ORDER = ["diamond", "platinum", "gold", "silver", "bronze"];
      const tiers = TIER_ORDER
        .filter(t => tierMap[t])
        .map(t => ({
          tier: t,
          count: tierMap[t].count,
          weeklyRevenue: Math.round(tierMap[t].weeklyRevenue * 100) / 100,
          monthlyRevenue: Math.round(tierMap[t].weeklyRevenue * 4.33 * 100) / 100,
          sampleNames: tierMap[t].names,
        }));

      return {
        tiers,
        totalWeeklyRevenue: Math.round(totalWeeklyRevenue * 100) / 100,
        totalMonthlyRevenue: Math.round(totalWeeklyRevenue * 4.33 * 100) / 100,
      };
    }),

  staffProductivity: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1), dateFrom: z.string(), dateTo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          staffName: staff.name,
          staffColour: staff.colourHex,
          appointmentCount: sql<number>`COUNT(${appointments.id})`,
          revenue: sql<string>`COALESCE(SUM(${appointments.price}), 0)`,
        })
        .from(appointments)
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          gte(appointments.scheduledStart, new Date(input.dateFrom)),
          lte(appointments.scheduledStart, new Date(input.dateTo))
        ))
        .groupBy(staff.id, staff.name, staff.colourHex)
        .orderBy(desc(sql`COUNT(${appointments.id})`));
    }),

  membershipAttributedRevenue: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1), dateFrom: z.string(), dateTo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { appointmentRevenue: 0, membershipRevenue: 0, totalRevenue: 0, completedAppts: 0, membershipAppts: 0, avgTicketAll: 0, avgTicketNonMember: 0 };

      const dateFrom = new Date(input.dateFrom);
      const dateTo = new Date(input.dateTo);
      const periodWeeks = Math.max(1, (dateTo.getTime() - dateFrom.getTime()) / (7 * 24 * 60 * 60 * 1000));

      // Appointment revenue (non-membership, completed, with price)
      const [apptRevRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${appointments.price}), 0)`, count: sql<number>`COUNT(*)` })
        .from(appointments)
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          eq(appointments.workflowState, "complete"),
          gte(appointments.scheduledStart, dateFrom),
          lte(appointments.scheduledStart, dateTo),
          sql`${appointments.price} > 0`
        ));

      // Count completed appointments for membership clients in period
      const memberAppts = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${appointments.id})` })
        .from(appointments)
        .innerJoin(memberships, and(
          eq(memberships.clientId, appointments.clientId),
          eq(memberships.status, "active"),
          eq(memberships.tenantId, input.tenantId)
        ))
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          eq(appointments.workflowState, "complete"),
          gte(appointments.scheduledStart, dateFrom),
          lte(appointments.scheduledStart, dateTo)
        ));

      // Active membership weekly revenue
      const memberRows = await db
        .select({ pricePerCycle: memberships.pricePerCycle, billingCycleWeeks: memberships.billingCycleWeeks })
        .from(memberships)
        .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.status, "active")));

      let totalWeeklyMemberRevenue = 0;
      for (const m of memberRows) {
        const price = parseFloat(m.pricePerCycle ?? "0");
        const weeks = m.billingCycleWeeks ?? 1;
        totalWeeklyMemberRevenue += weeks > 0 ? price / weeks : price;
      }

      const membershipRevenue = Math.round(totalWeeklyMemberRevenue * periodWeeks * 100) / 100;
      const appointmentRevenue = parseFloat(apptRevRow?.total ?? "0");
      const totalRevenue = appointmentRevenue + membershipRevenue;
      const completedAppts = apptRevRow?.count ?? 0;
      const membershipApptCount = (memberAppts[0]?.count as number) ?? 0;
      const avgTicketAll = completedAppts + membershipApptCount > 0
        ? Math.round(totalRevenue / (completedAppts + membershipApptCount) * 100) / 100
        : 0;
      const avgTicketNonMember = completedAppts > 0
        ? Math.round(appointmentRevenue / completedAppts * 100) / 100
        : 0;

      return { appointmentRevenue, membershipRevenue, totalRevenue, completedAppts, membershipAppts: membershipApptCount, avgTicketAll, avgTicketNonMember };
    }),
});

// ─── Analytics Revenue Time Series ───────────────────────────────────────────
const analyticsRouterExtended = router({
  revenueTimeSeries: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1), dateFrom: z.string(), dateTo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const dateFrom = new Date(input.dateFrom);
      const dateTo = new Date(input.dateTo);
      const diffDays = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000));
      const bucketDays = diffDays <= 31 ? 1 : diffDays <= 90 ? 7 : 30;
      const apptRows = await db
        .select({ scheduledStart: appointments.scheduledStart, price: appointments.price })
        .from(appointments)
        .where(and(
          eq(appointments.tenantId, input.tenantId),
          eq(appointments.workflowState, "complete"),
          gte(appointments.scheduledStart, dateFrom),
          lte(appointments.scheduledStart, dateTo),
          sql`${appointments.price} > 0`
        ));
      const memberRows = await db
        .select({ pricePerCycle: memberships.pricePerCycle, billingCycleWeeks: memberships.billingCycleWeeks })
        .from(memberships)
        .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.status, "active")));
      let totalWeeklyMemberRevenue = 0;
      for (const m of memberRows) {
        const price = parseFloat(m.pricePerCycle ?? "0");
        const weeks = m.billingCycleWeeks ?? 1;
        totalWeeklyMemberRevenue += weeks > 0 ? price / weeks : price;
      }
      const dailyMemberRevenue = totalWeeklyMemberRevenue / 7;
      const buckets: { label: string; apptRevenue: number; memberRevenue: number }[] = [];
      let cursor = new Date(dateFrom);
      while (cursor <= dateTo) {
        const bucketEnd = new Date(cursor);
        bucketEnd.setDate(bucketEnd.getDate() + bucketDays - 1);
        if (bucketEnd > dateTo) bucketEnd.setTime(dateTo.getTime());
        const label = bucketDays === 1
          ? cursor.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Brisbane" })
          : cursor.toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "Australia/Brisbane" });
        const bucketApptRevenue = apptRows
          .filter(r => r.scheduledStart && r.scheduledStart >= cursor && r.scheduledStart <= bucketEnd)
          .reduce((sum, r) => sum + parseFloat(r.price ?? "0"), 0);
        const bucketDaysActual = Math.ceil((bucketEnd.getTime() - cursor.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        const bucketMemberRevenue = dailyMemberRevenue * bucketDaysActual;
        buckets.push({ label, apptRevenue: Math.round(bucketApptRevenue * 100) / 100, memberRevenue: Math.round(bucketMemberRevenue * 100) / 100 });
        cursor.setDate(cursor.getDate() + bucketDays);
      }
      return buckets;
    }),
});

// ─── Migration ────────────────────────────────────────────────────────────────
// ─── Groom Style Notes ───────────────────────────────────────────────────────
const groomStyleNotesRouter = router({
  listByPet: operationalProcedure
    .input(z.object({ petId: z.number(), limit: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      await requireApprovedStaffPetAccess(db, ctx.user, input.petId);
      return db
        .select({
          id: groomStyleNotes.id,
          petId: groomStyleNotes.petId,
          appointmentId: groomStyleNotes.appointmentId,
          note: groomStyleNotes.note,
          serviceType: groomStyleNotes.serviceType,
          bladeSize: groomStyleNotes.bladeSize,
          combSize: groomStyleNotes.combSize,
          bodyLength: groomStyleNotes.bodyLength,
          headStyle: groomStyleNotes.headStyle,
          faceStyle: groomStyleNotes.faceStyle,
          earStyle: groomStyleNotes.earStyle,
          legStyle: groomStyleNotes.legStyle,
          tailStyle: groomStyleNotes.tailStyle,
          warnings: groomStyleNotes.warnings,
          alertLevel: groomStyleNotes.alertLevel,
          photoUrl: groomStyleNotes.photoUrl,
          staffName: staff.name,
          createdAt: groomStyleNotes.createdAt,
        })
        .from(groomStyleNotes)
        .leftJoin(staff, eq(groomStyleNotes.staffId, staff.id))
        .where(eq(groomStyleNotes.petId, input.petId))
        .orderBy(desc(groomStyleNotes.createdAt))
        .limit(input.limit);
    }),

  create: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      petId: z.number(),
      appointmentId: z.number().optional(),
      staffId: z.number().optional(),
      note: z.string().min(1),
      serviceType: z.string().optional(),
      bladeSize: z.string().optional(),
      combSize: z.string().optional(),
      bodyLength: z.string().optional(),
      headStyle: z.string().optional(),
      faceStyle: z.string().optional(),
      earStyle: z.string().optional(),
      legStyle: z.string().optional(),
      tailStyle: z.string().optional(),
      warnings: z.string().optional(),
      alertLevel: z.string().optional(),
      presetId: z.number().optional(),
      photoUrl: z.string().optional(),
      photoKey: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffPetAccess(db, ctx.user, input.petId);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This salon is not available to your staff profile");
      if (input.appointmentId) await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId, input.petId);
      await db.insert(groomStyleNotes).values({
        tenantId: input.tenantId,
        petId: input.petId,
        appointmentId: input.appointmentId ?? null,
        staffId: portalStaff?.id ?? input.staffId ?? null,
        note: input.note,
        serviceType: input.serviceType ?? null,
        bladeSize: input.bladeSize ?? null,
        combSize: input.combSize ?? null,
        bodyLength: input.bodyLength ?? null,
        headStyle: input.headStyle ?? null,
        faceStyle: input.faceStyle ?? null,
        earStyle: input.earStyle ?? null,
        legStyle: input.legStyle ?? null,
        tailStyle: input.tailStyle ?? null,
        warnings: input.warnings ?? null,
        alertLevel: input.alertLevel ?? null,
        presetId: input.presetId ?? null,
        photoUrl: input.photoUrl ?? null,
        photoKey: input.photoKey ?? null,
      });
      return { success: true };
    }),

  delete: operationalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [note] = await db.select({ petId: groomStyleNotes.petId }).from(groomStyleNotes).where(eq(groomStyleNotes.id, input.id)).limit(1);
      if (!note) throw new Error("Grooming note not found");
      await requireApprovedStaffPetAccess(db, ctx.user, note.petId);
      await db.delete(groomStyleNotes).where(eq(groomStyleNotes.id, input.id));
      return { success: true };
    }),

  getLastStyle: operationalProcedure
    .input(z.object({ petId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      await requireApprovedStaffPetAccess(db, ctx.user, input.petId);
      const [last] = await db
        .select()
        .from(groomStyleNotes)
        .where(eq(groomStyleNotes.petId, input.petId))
        .orderBy(desc(groomStyleNotes.createdAt))
        .limit(1);
      return last ?? null;
    }),

  getLastCompletedStyle: operationalProcedure
    .input(z.object({ petId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      await requireApprovedStaffPetAccess(db, ctx.user, input.petId);
      const [lastCompleted] = await db
        .select({
          id: groomStyleNotes.id,
          appointmentId: groomStyleNotes.appointmentId,
          note: groomStyleNotes.note,
          serviceType: groomStyleNotes.serviceType,
          bladeSize: groomStyleNotes.bladeSize,
          combSize: groomStyleNotes.combSize,
          bodyLength: groomStyleNotes.bodyLength,
          headStyle: groomStyleNotes.headStyle,
          faceStyle: groomStyleNotes.faceStyle,
          earStyle: groomStyleNotes.earStyle,
          legStyle: groomStyleNotes.legStyle,
          tailStyle: groomStyleNotes.tailStyle,
          warnings: groomStyleNotes.warnings,
          alertLevel: groomStyleNotes.alertLevel,
          photoUrl: groomStyleNotes.photoUrl,
          staffName: staff.name,
          completedAt: appointments.completedAt,
          scheduledStart: appointments.scheduledStart,
          createdAt: groomStyleNotes.createdAt,
        })
        .from(groomStyleNotes)
        .innerJoin(appointments, eq(groomStyleNotes.appointmentId, appointments.id))
        .leftJoin(staff, eq(groomStyleNotes.staffId, staff.id))
        .where(and(
          eq(groomStyleNotes.petId, input.petId),
          eq(appointments.workflowState, "complete"),
        ))
        .orderBy(desc(appointments.completedAt), desc(groomStyleNotes.createdAt))
        .limit(1);
      return lastCompleted ?? null;
    }),
});

// ─── Groom Style Presets ────────────────────────────────────────────────────
const groomStylePresetsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(groomStylePresets)
        .where(eq(groomStylePresets.tenantId, 1))
        .orderBy(groomStylePresets.name);
      if (input.search) {
        const q = input.search.toLowerCase();
        return rows.filter(r => r.name.toLowerCase().includes(q));
      }
      return rows;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      serviceType: z.string().optional(),
      bladeSize: z.string().optional(),
      combSize: z.string().optional(),
      bodyLength: z.string().optional(),
      headStyle: z.string().optional(),
      faceStyle: z.string().optional(),
      earStyle: z.string().optional(),
      legStyle: z.string().optional(),
      tailStyle: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(groomStylePresets).values({
        tenantId: 1,
        name: input.name,
        serviceType: input.serviceType ?? null,
        bladeSize: input.bladeSize ?? null,
        combSize: input.combSize ?? null,
        bodyLength: input.bodyLength ?? null,
        headStyle: input.headStyle ?? null,
        faceStyle: input.faceStyle ?? null,
        earStyle: input.earStyle ?? null,
        legStyle: input.legStyle ?? null,
        tailStyle: input.tailStyle ?? null,
        notes: input.notes ?? null,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(groomStylePresets).where(eq(groomStylePresets.id, input.id));
      return { success: true };
    }),
});

// ─── Grooming Reports ───────────────────────────────────────────────────────────
const groomingReportsRouter = router({
  getByAppointment: operationalProcedure
    .input(z.object({ appointmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);
      const [report] = await db
        .select()
        .from(groomingReports)
        .where(eq(groomingReports.appointmentId, input.appointmentId))
        .limit(1);
      return report ?? null;
    }),

  upsert: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      petId: z.number(),
      tenantId: z.number().default(1),
      overallRating: z.enum(["pawfect", "great", "good", "okay", "difficult"]).optional(),
      mood: z.string().optional(),
      additionalNote: z.string().optional(),
      coatCondition: z.enum(["excellent", "good", "fair", "poor", "matted"]).optional(),
      skinCondition: z.enum(["excellent", "good", "fair", "irritated", "flaky"]).optional(),
      eyeCondition: z.enum(["bright_clear", "mild_discharge", "needs_vet"]).optional(),
      earCondition: z.enum(["clean", "mild_buildup", "dirty", "needs_vet"]).optional(),
      nailCondition: z.enum(["trimmed", "long", "very_long", "broken"]).optional(),
      teethCondition: z.enum(["clean", "mild_tartar", "heavy_tartar", "needs_vet"]).optional(),
      beforePhotoUrl: z.string().optional(),
      beforePhotoKey: z.string().optional(),
      afterPhotoUrl: z.string().optional(),
      afterPhotoKey: z.string().optional(),
      recommendedFrequencyWeeks: z.number().optional(),
      groomerNotes: z.string().optional(),
      status: z.enum(["draft", "sent"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId, input.petId);
      const existing = await db
        .select({ id: groomingReports.id })
        .from(groomingReports)
        .where(eq(groomingReports.appointmentId, input.appointmentId))
        .limit(1);
      const values = {
        petId: input.petId,
        tenantId: input.tenantId,
        overallRating: input.overallRating,
        mood: input.mood,
        additionalNote: input.additionalNote,
        groomerNotes: input.groomerNotes,
        coatCondition: input.coatCondition,
        skinCondition: input.skinCondition,
        eyeCondition: input.eyeCondition,
        earCondition: input.earCondition,
        nailCondition: input.nailCondition,
        teethCondition: input.teethCondition,
        beforePhotoUrl: input.beforePhotoUrl,
        beforePhotoKey: input.beforePhotoKey,
        afterPhotoUrl: input.afterPhotoUrl,
        afterPhotoKey: input.afterPhotoKey,
        recommendedFrequencyWeeks: input.recommendedFrequencyWeeks,
        status: input.status,
      };
      if (existing.length > 0) {
        await db.update(groomingReports).set(values).where(eq(groomingReports.id, existing[0].id));
        return { id: existing[0].id };
      } else {
        const [result] = await db.insert(groomingReports).values({ appointmentId: input.appointmentId, ...values });
        return { id: (result as any).insertId as number };
      }
    }),

  attachStaffPhoto: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      petId: z.number(),
      position: z.enum(["before", "after"]),
      photoUrl: z.string().min(1),
      photoKey: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const portalStaff = await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId, input.petId);
      const [existing] = await db.select({ id: groomingReports.id }).from(groomingReports)
        .where(eq(groomingReports.appointmentId, input.appointmentId)).limit(1);
      const photoFields = input.position === "before"
        ? { beforePhotoUrl: input.photoUrl, beforePhotoKey: input.photoKey }
        : { afterPhotoUrl: input.photoUrl, afterPhotoKey: input.photoKey };
      if (existing) {
        await db.update(groomingReports).set(photoFields).where(eq(groomingReports.id, existing.id));
      } else {
        await db.insert(groomingReports).values({ appointmentId: input.appointmentId, petId: input.petId, tenantId: 1, status: "draft", ...photoFields });
      }
      if (portalStaff) {
        await recordStaffAccessEvent(db, {
          tenantId: portalStaff.tenantId,
          staffId: portalStaff.id,
          actorUserId: ctx.user.id,
          eventType: "grooming_card_uploaded",
          note: `${input.position === "before" ? "Before" : "After"} photo added to appointment ${input.appointmentId}`,
        });
      }
      return { success: true };
    }),

  getSessionReports: operationalProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      // Get all appointments in this session
      const sessionAppts = await db
        .select({ id: appointments.id, petId: appointments.petId })
        .from(appointments)
        .where(eq(appointments.sessionId, input.sessionId));
      if (sessionAppts.length === 0) return [];
      await requireApprovedStaffAppointmentAccess(db, ctx.user, sessionAppts[0].id);
      const apptIds = sessionAppts.map(a => a.id);
      return db
        .select()
        .from(groomingReports)
      .where(inArray(groomingReports.appointmentId, apptIds));
    }),

  emailReport: operationalProcedure
    .input(z.object({
      appointmentId: z.number(),
      reportHtml: z.string(),
      petName: z.string(),
      clientEmail: z.string().email(),
      clientName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      if (ctx.user.role !== "admin") throw new Error("Only administrators can email grooming cards to clients");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);
      const [appointmentRecipient] = await db
        .select({ email: clients.email })
        .from(appointments)
        .leftJoin(clients, eq(appointments.clientId, clients.id))
        .where(eq(appointments.id, input.appointmentId))
        .limit(1);
      if (!appointmentRecipient?.email || appointmentRecipient.email.trim().toLowerCase() !== input.clientEmail.trim().toLowerCase()) {
        throw new Error("The grooming card can only be sent to the appointment client's saved email address");
      }
      const { sendEmail } = await import("./email");
      const subject = `Grooming Report for ${input.petName} 🐾`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
          <div style="background:#0d9488;padding:24px 32px">
            <h1 style="color:#fff;margin:0;font-size:22px">Grooming Report</h1>
            <p style="color:#ccfbf1;margin:4px 0 0;font-size:14px">Hi ${input.clientName}, here's ${input.petName}'s grooming report from today's visit.</p>
          </div>
          <div style="padding:24px 32px">
            ${input.reportHtml}
          </div>
          <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
            <p style="color:#9ca3af;font-size:11px;margin:0">Sent via Groomigo · Barkin' Beautiful Grooming Studio</p>
          </div>
        </div>`;
      const sent = await sendEmail({ to: input.clientEmail, subject, html });
      if (!sent) throw new Error("Email could not be sent — check RESEND_API_KEY configuration");
      await db.update(groomingReports)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(groomingReports.appointmentId, input.appointmentId));
      return { sent: true };
    }),
});

// ─── Settings (Tenant Info) ─────────────────────────────────────────────────────────────────────────────────
const settingsRouter = router({
  getTenantInfo: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== input.tenantId) throw new Error("This salon branding is not available to your staff profile");
      const [t] = await db
        .select({
          name: tenants.name,
          phone: tenants.phone,
          email: tenants.email,
          address: tenants.address,
          logoUrl: tenants.logoUrl,
          brandFont: tenants.brandFont,
          brandPrimary: tenants.brandPrimary,
          brandAccent: tenants.brandAccent,
          brandSidebar: tenants.brandSidebar,
          stripeBillingMode: tenants.stripeBillingMode,
          stripeConnectedAt: tenants.stripeConnectedAt,
        })
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .limit(1);
      return t ?? null;
    }),

  updateTenantInfo: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      logoUrl: z.string().url().optional(),
      brandFont: z.enum(["Inter", "DM Sans", "Plus Jakarta Sans", "Manrope", "Nunito Sans"]).optional(),
      brandPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      brandAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      brandSidebar: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(tenants).set({
        phone: input.phone,
        email: input.email,
        address: input.address,
        logoUrl: input.logoUrl,
        brandFont: input.brandFont,
        brandPrimary: input.brandPrimary,
        brandAccent: input.brandAccent,
        brandSidebar: input.brandSidebar,
      }).where(eq(tenants.id, input.tenantId));
      return { success: true };
  }),
});

// ─── Stripe Membership Billing (prototype-safe reconciliation) ────────────────
const stripeBillingRouter = router({
  getStatus: adminProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [tenant] = await db.select({ mode: tenants.stripeBillingMode, connectedAt: tenants.stripeConnectedAt }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
      const [membershipStats] = await db.select({
        activeMemberships: sql<number>`SUM(CASE WHEN ${memberships.status} = 'active' THEN 1 ELSE 0 END)`,
        moegoLinkedMemberships: sql<number>`SUM(CASE WHEN ${memberships.moegoMembershipId} IS NOT NULL THEN 1 ELSE 0 END)`,
        stripeMappedSubscriptions: sql<number>`SUM(CASE WHEN ${memberships.stripeSubscriptionId} IS NOT NULL THEN 1 ELSE 0 END)`,
      }).from(memberships).where(eq(memberships.tenantId, input.tenantId));
      const [clientStats] = await db.select({ stripeMappedCustomers: sql<number>`SUM(CASE WHEN ${clients.stripeCustomerId} IS NOT NULL THEN 1 ELSE 0 END)` }).from(clients).where(eq(clients.tenantId, input.tenantId));
      const counts = {
        activeMemberships: Number(membershipStats?.activeMemberships ?? 0),
        moegoLinkedMemberships: Number(membershipStats?.moegoLinkedMemberships ?? 0),
        stripeMappedSubscriptions: Number(membershipStats?.stripeMappedSubscriptions ?? 0),
        stripeMappedCustomers: Number(clientStats?.stripeMappedCustomers ?? 0),
      };
      return { ...counts, ...getStripePrototypeStatus(tenant?.mode, tenant?.connectedAt, counts), connectedAt: tenant?.connectedAt ?? null };
    }),
  getReconciliationPreview: adminProcedure
    .input(z.object({ tenantId: z.number().default(1), limit: z.number().min(1).max(100).default(25) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        membershipId: memberships.id,
        membershipName: memberships.name,
        membershipStatus: memberships.status,
        moegoMembershipId: memberships.moegoMembershipId,
        stripeSubscriptionId: memberships.stripeSubscriptionId,
        clientId: clients.id,
        clientName: sql<string>`CONCAT(${clients.firstName}, ' ', ${clients.lastName})`,
        stripeCustomerId: clients.stripeCustomerId,
      }).from(memberships).innerJoin(clients, eq(memberships.clientId, clients.id)).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.status, "active"))).limit(input.limit);
    }),
  createInvoiceCheckout: adminProcedure
    .input(z.object({ tenantId: z.number().default(1), invoiceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [invoice] = await db.select({
        id: invoices.id, invoiceNumber: invoices.invoiceNumber, total: invoices.total, status: invoices.status,
        tenantId: invoices.tenantId, membershipId: invoices.membershipId, clientId: invoices.clientId,
        clientFirstName: clients.firstName, clientLastName: clients.lastName, clientEmail: clients.email,
      }).from(invoices).innerJoin(clients, eq(invoices.clientId, clients.id)).where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId))).limit(1);
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status === "paid" || invoice.status === "cancelled") throw new Error("This invoice is no longer available for payment");
      const origin = typeof ctx.req.headers.origin === "string" ? ctx.req.headers.origin : (process.env.VITE_APP_URL ?? "https://groomingsos-mqzfsvzv.manus.space");
      return createInvoiceCheckout({
        invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, totalCents: Math.round(Number(invoice.total) * 100),
        clientId: invoice.clientId, clientName: `${invoice.clientFirstName} ${invoice.clientLastName}`.trim(), clientEmail: invoice.clientEmail,
        membershipId: invoice.membershipId, tenantId: invoice.tenantId, origin,
      });
    }),
});

// ─── Online Booking Capacity Controls ─────────────────────────────────────────
const ONLINE_SERVICE_MINUTES: Record<string, number> = {
  classic_groom: 120, styled_groom: 150, bath_only: 60, nail_trim: 30,
  daycare: 240, deshed: 90, other: 60,
};

function aestDayBounds(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, day - 1, 14, 0, 0)),
    end: new Date(Date.UTC(year, month - 1, day, 14, 0, 0)),
  };
}

async function checkOnlineCapacity(input: { tenantId: number; staffId: number; serviceType: keyof typeof ONLINE_SERVICE_MINUTES; scheduledStart: Date; petWeightKg?: number }, options: { preview?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [tenant] = await db.select({ enabled: tenants.onlineBookingEnabled, bathLimit: tenants.onlineBathOnlyDailyLimit, bathCapacity: tenants.onlineBathCapacityPerSlot, leadHours: tenants.onlineBookingLeadHours })
    .from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
  if (!Boolean(Number(tenant?.enabled)) && !options.preview) return { available: false, reason: "Online booking is not enabled yet" } as const;
  const [groomer] = await db.select({ onlineBookable: staff.onlineBookable, isActive: staff.isActive, slotLimit: staff.onlineMaxDogsPerSlot, dailyLimit: staff.onlineMaxDogsPerDay, services: staff.onlineServices })
    .from(staff).where(and(eq(staff.id, input.staffId), eq(staff.tenantId, input.tenantId))).limit(1);
  if (!groomer?.isActive || !groomer.onlineBookable) return { available: false, reason: "This groomer is not available for online booking" } as const;
  if (groomer.services) {
    try {
      const allowed = JSON.parse(groomer.services) as string[];
      if (allowed.length && !allowed.includes(input.serviceType)) return { available: false, reason: "This service is not offered by the selected groomer" } as const;
    } catch { /* Invalid legacy JSON has no service restriction. */ }
  }
  if (input.scheduledStart.getTime() < Date.now() + tenant.leadHours * 3600000) return { available: false, reason: `Bookings require at least ${tenant.leadHours} hours notice` } as const;
  const durationMinutes = ONLINE_SERVICE_MINUTES[input.serviceType] ?? 60;
  const scheduledEnd = new Date(input.scheduledStart.getTime() + durationMinutes * 60000);
  const dateKey = input.scheduledStart.toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  const { start, end } = aestDayBounds(dateKey);
  const activeStatuses = ["confirmed", "pending"] as const;
  const staffAppointments = await db.select({ id: appointments.id, scheduledStart: appointments.scheduledStart, scheduledEnd: appointments.scheduledEnd })
    .from(appointments).where(and(eq(appointments.tenantId, input.tenantId), eq(appointments.staffId, input.staffId), gte(appointments.scheduledStart, start), lte(appointments.scheduledStart, end), inArray(appointments.status, activeStatuses as any)));
  const overlappingBookings = countOverlappingBookings(staffAppointments, input.scheduledStart, scheduledEnd);
  if (!isOnlineSlotAvailable({ overlappingBookings, slotLimit: groomer.slotLimit, bookingsToday: staffAppointments.length, dailyLimit: groomer.dailyLimit })) {
    const reason = overlappingBookings >= Math.max(1, groomer.slotLimit) ? "That groomer’s time slot is full" : "That groomer has reached their daily online booking limit";
    return { available: false, reason } as const;
  }
  if (input.petWeightKg !== undefined && isLargeDogFullGroom(input.serviceType, input.petWeightKg)) {
    const salonAppointments = await db.select({
      staffId: appointments.staffId,
      serviceType: appointments.serviceType,
      scheduledStart: appointments.scheduledStart,
      petId: appointments.petId,
    })
      .from(appointments)
      .where(and(
        eq(appointments.tenantId, input.tenantId),
        gte(appointments.scheduledStart, start),
        lte(appointments.scheduledStart, end),
        inArray(appointments.status, activeStatuses as any),
      ));
    const petIds = salonAppointments.map((appointment) => appointment.petId);
    const existingPets = petIds.length
      ? await db.select({ id: pets.id, weightKg: pets.weightKg, weight: pets.weight }).from(pets).where(inArray(pets.id, petIds))
      : [];
    const weightsByPetId = new Map(existingPets.map((pet) => [pet.id, pet.weightKg ?? pet.weight]));
    const largeDogCapacity = getLargeDogCapacityResult({
      existingBookings: salonAppointments.map((appointment) => ({
        staffId: appointment.staffId,
        serviceType: appointment.serviceType,
        scheduledStart: appointment.scheduledStart,
        petWeightKg: weightsByPetId.get(appointment.petId) ?? null,
      })),
      requestedStaffId: input.staffId,
      requestedServiceType: input.serviceType,
      requestedWeightKg: input.petWeightKg,
      requestedStart: input.scheduledStart,
    });
    if (!largeDogCapacity.available) return largeDogCapacity;
  }
  if (input.serviceType === "bath_only") {
    const bathOnly = await db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.tenantId, input.tenantId), eq(appointments.serviceType, "bath_only"), gte(appointments.scheduledStart, start), lte(appointments.scheduledStart, end), inArray(appointments.status, activeStatuses as any)));
    if (bathOnly.length >= tenant.bathLimit) return { available: false, reason: `The daily online bath-only limit of ${tenant.bathLimit} has been reached` } as const;
  }
  if (BATH_RESOURCE_MINUTES[input.serviceType]) {
    const bathResources = await db.select({ serviceType: appointments.serviceType, scheduledStart: appointments.scheduledStart }).from(appointments).where(and(eq(appointments.tenantId, input.tenantId), inArray(appointments.serviceType, Object.keys(BATH_RESOURCE_MINUTES) as any), gte(appointments.scheduledStart, start), lte(appointments.scheduledStart, end), inArray(appointments.status, activeStatuses as any)));
    const bathOverlaps = countSharedBathResourceOverlaps(bathResources, input.serviceType, input.scheduledStart);
    if (bathOverlaps >= Math.max(1, tenant.bathCapacity)) return { available: false, reason: "All bathing stations are occupied for that time" } as const;
  }
  return { available: true, scheduledEnd, durationMinutes } as const;
}

type OnlineSlotListInput = {
  tenantId: number;
  staffId: number;
  serviceType: keyof typeof ONLINE_SERVICE_MINUTES;
  petWeightKg: number;
  date: string;
};

async function listAvailableOnlineSlots(input: OnlineSlotListInput, options: { preview?: boolean } = {}) {
  if (!isEligibleOnlineBookingService(input.serviceType, input.petWeightKg)) {
    throw new Error("Select a valid dog weight to see eligible booking services");
  }
  const durationMinutes = ONLINE_SERVICE_MINUTES[input.serviceType] ?? 60;
  const candidates = buildOnlineBookingSlotStarts(input.date, durationMinutes);
  const checked = await Promise.all(candidates.map(async scheduledStart => ({
    scheduledStart,
    result: await checkOnlineCapacity({ ...input, scheduledStart }, options),
  })));
  return checked.flatMap(({ scheduledStart, result }) => {
    if (!result.available) return [];
    return [{
      scheduledStart,
      scheduledEnd: result.scheduledEnd,
      durationMinutes: result.durationMinutes,
    }];
  });
}

const onlineBookingRouter = router({
  getSettings: protectedProcedure.input(z.object({ tenantId: z.number().default(1) })).query(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new Error("Administrator access required");
    const db = await getDb(); if (!db) throw new Error("DB unavailable");
    const [tenant] = await db.select({ onlineBookingEnabled: tenants.onlineBookingEnabled, onlineBathOnlyDailyLimit: tenants.onlineBathOnlyDailyLimit, onlineBathCapacityPerSlot: tenants.onlineBathCapacityPerSlot, onlineBookingSlotMinutes: tenants.onlineBookingSlotMinutes, onlineBookingLeadHours: tenants.onlineBookingLeadHours }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
    return tenant;
  }),
  updateSettings: protectedProcedure.input(z.object({ tenantId: z.number().default(1), onlineBookingEnabled: z.boolean().optional(), onlineBathOnlyDailyLimit: z.number().int().min(0).max(30).optional(), onlineBathCapacityPerSlot: z.number().int().min(1).max(20).optional(), onlineBookingSlotMinutes: z.number().int().min(15).max(120).optional(), onlineBookingLeadHours: z.number().int().min(0).max(336).optional() })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new Error("Administrator access required");
    const db = await getDb(); if (!db) throw new Error("DB unavailable");
    const { tenantId, ...settings } = input; await db.update(tenants).set(settings).where(eq(tenants.id, tenantId)); return { success: true };
  }),
  listGroomerProfiles: publicProcedure.input(z.object({ tenantId: z.number().default(1) })).query(async ({ input }) => {
    const db = await getDb(); if (!db) return [];
    const [tenant] = await db.select({ enabled: tenants.onlineBookingEnabled }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
    if (!Boolean(Number(tenant?.enabled))) return [];
    return db.select({ id: staff.id, name: staff.name, role: staff.role, colourHex: staff.colourHex, photoUrl: staff.onlineProfilePhotoUrl, bio: staff.onlineBio, services: staff.onlineServices, maxDogsPerSlot: staff.onlineMaxDogsPerSlot }).from(staff).where(and(eq(staff.tenantId, input.tenantId), eq(staff.isActive, true), eq(staff.onlineBookable, true))).orderBy(asc(staff.name));
  }),
  listPreviewGroomerProfiles: protectedProcedure.input(z.object({ tenantId: z.number().default(1) })).query(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new Error("Administrator access required");
    const db = await getDb(); if (!db) return [];
    return db.select({ id: staff.id, name: staff.name, role: staff.role, colourHex: staff.colourHex, photoUrl: staff.onlineProfilePhotoUrl, bio: staff.onlineBio, services: staff.onlineServices, maxDogsPerSlot: staff.onlineMaxDogsPerSlot }).from(staff).where(and(eq(staff.tenantId, input.tenantId), eq(staff.isActive, true), eq(staff.onlineBookable, true))).orderBy(asc(staff.name));
  }),
  listAvailableSlots: publicProcedure.input(z.object({ tenantId: z.number().default(1), staffId: z.number(), serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]), petWeightKg: z.coerce.number().min(0).max(80), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).query(async ({ input }) => {
    return listAvailableOnlineSlots(input);
  }),
  listPreviewAvailableSlots: protectedProcedure.input(z.object({ tenantId: z.number().default(1), staffId: z.number(), serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]), petWeightKg: z.coerce.number().min(0).max(80), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).query(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new Error("Administrator access required");
    return listAvailableOnlineSlots(input, { preview: true });
  }),
  validateSlot: publicProcedure.input(z.object({ tenantId: z.number().default(1), staffId: z.number(), serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]), petWeightKg: z.coerce.number().min(0).max(80), scheduledStart: z.coerce.date() })).mutation(async ({ input }) => {
    if (!isEligibleOnlineBookingService(input.serviceType, input.petWeightKg)) throw new Error("Select a valid dog weight to see eligible booking services");
    return checkOnlineCapacity(input);
  }),
  validatePreviewSlot: protectedProcedure.input(z.object({ tenantId: z.number().default(1), staffId: z.number(), serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]), petWeightKg: z.coerce.number().min(0).max(80), scheduledStart: z.coerce.date() })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new Error("Administrator access required");
    if (!isEligibleOnlineBookingService(input.serviceType, input.petWeightKg)) throw new Error("Select a valid dog weight to see eligible booking services");
    return checkOnlineCapacity(input, { preview: true });
  }),
  create: publicProcedure.input(z.object({ tenantId: z.number().default(1), clientId: z.number(), petId: z.number(), staffId: z.number(), serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]), scheduledStart: z.coerce.date(), notes: z.string().max(1000).optional() })).mutation(async ({ input }) => {
    const db = await getDb(); if (!db) throw new Error("DB unavailable");
    const [pet] = await db.select({ id: pets.id, weightKg: pets.weightKg, weight: pets.weight }).from(pets).where(and(eq(pets.id, input.petId), eq(pets.clientId, input.clientId), eq(pets.tenantId, input.tenantId))).limit(1);
    if (!pet) throw new Error("Pet does not belong to the selected client");
    const petWeight = pet.weightKg ?? pet.weight;
    if (!isEligibleOnlineBookingService(input.serviceType, petWeight)) throw new Error("This pet needs a recorded weight between 0 and 80kg before online booking");
    const capacity = await checkOnlineCapacity({ ...input, petWeightKg: Number(petWeight) }); if (!capacity.available || !capacity.scheduledEnd) throw new Error(capacity.reason ?? "The selected slot is unavailable");
    const [result] = await db.insert(appointments).values({ tenantId: input.tenantId, clientId: input.clientId, petId: input.petId, staffId: input.staffId, serviceType: input.serviceType, scheduledStart: input.scheduledStart, scheduledEnd: capacity.scheduledEnd, notes: input.notes ?? null, status: "pending", workflowState: "scheduled" });
    return { success: true, appointmentId: (result as any).insertId as number };
  }),
  createGuest: publicProcedure.input(z.object({
    tenantId: z.number().default(1),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email().optional().or(z.literal("")),
    petName: z.string().trim().min(1).max(100),
    breed: z.string().trim().max(100).optional(),
    weightKg: z.coerce.number().min(0).max(80),
    staffId: z.number(),
    serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]),
    scheduledStart: z.coerce.date(),
    notes: z.string().max(1000).optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb(); if (!db) throw new Error("DB unavailable");
    const weightBand = getPetWeightBand(input.weightKg);
    if (!weightBand || !isEligibleOnlineBookingService(input.serviceType, input.weightKg)) throw new Error("Select a valid dog weight to see eligible booking services");
    const capacity = await checkOnlineCapacity(input); if (!capacity.available || !capacity.scheduledEnd) throw new Error(capacity.reason ?? "The selected slot is unavailable");
    const email = input.email?.trim().toLowerCase() || null;
    const identity = email ? or(eq(clients.email, email), eq(clients.phone, input.phone)) : eq(clients.phone, input.phone);
    let [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, input.tenantId), identity)).limit(1);
    if (!client) {
      const [created] = await db.insert(clients).values({ tenantId: input.tenantId, firstName: input.firstName, lastName: input.lastName, phone: input.phone, email, status: "active" });
      client = { id: (created as any).insertId as number };
    }
    const [existingPet] = await db.select({ id: pets.id }).from(pets).where(and(eq(pets.tenantId, input.tenantId), eq(pets.clientId, client.id), eq(pets.name, input.petName))).limit(1);
    let petId = existingPet?.id;
    if (!petId) {
      const [createdPet] = await db.insert(pets).values({ tenantId: input.tenantId, clientId: client.id, name: input.petName, breed: input.breed || null, weightKg: String(input.weightKg), weight: String(input.weightKg) });
      petId = (createdPet as any).insertId as number;
    }
    const sizeNote = `Online booking size: ${weightBand.label} (${input.weightKg}kg).`;
    const notes = [input.notes?.trim(), sizeNote].filter(Boolean).join("\n");
    const [result] = await db.insert(appointments).values({ tenantId: input.tenantId, clientId: client.id, petId, staffId: input.staffId, serviceType: input.serviceType, scheduledStart: input.scheduledStart, scheduledEnd: capacity.scheduledEnd, notes, status: "pending", workflowState: "scheduled" });
    return { success: true, appointmentId: (result as any).insertId as number };
  }),
  createPreviewGuest: protectedProcedure.input(z.object({
    tenantId: z.number().default(1),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email().optional().or(z.literal("")),
    petName: z.string().trim().min(1).max(100),
    breed: z.string().trim().max(100).optional(),
    weightKg: z.coerce.number().min(0).max(80),
    staffId: z.number(),
    serviceType: z.enum(["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]),
    scheduledStart: z.coerce.date(),
    notes: z.string().max(1000).optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new Error("Administrator access required");
    const db = await getDb(); if (!db) throw new Error("DB unavailable");
    const weightBand = getPetWeightBand(input.weightKg);
    if (!weightBand || !isEligibleOnlineBookingService(input.serviceType, input.weightKg)) throw new Error("Select a valid dog weight to see eligible booking services");
    const capacity = await checkOnlineCapacity(input, { preview: true }); if (!capacity.available || !capacity.scheduledEnd) throw new Error(capacity.reason ?? "The selected slot is unavailable");
    const email = input.email?.trim().toLowerCase() || null;
    const identity = email ? or(eq(clients.email, email), eq(clients.phone, input.phone)) : eq(clients.phone, input.phone);
    let [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, input.tenantId), identity)).limit(1);
    if (!client) {
      const [created] = await db.insert(clients).values({ tenantId: input.tenantId, firstName: input.firstName, lastName: input.lastName, phone: input.phone, email, status: "active" });
      client = { id: (created as any).insertId as number };
    }
    const [existingPet] = await db.select({ id: pets.id }).from(pets).where(and(eq(pets.tenantId, input.tenantId), eq(pets.clientId, client.id), eq(pets.name, input.petName))).limit(1);
    let petId = existingPet?.id;
    if (!petId) {
      const [createdPet] = await db.insert(pets).values({ tenantId: input.tenantId, clientId: client.id, name: input.petName, breed: input.breed || null, weightKg: String(input.weightKg), weight: String(input.weightKg) });
      petId = (createdPet as any).insertId as number;
    }
    const notes = buildOnlineBookingNotes({ notes: input.notes, sizeLabel: weightBand.label, weightKg: input.weightKg, preview: true });
    const [result] = await db.insert(appointments).values({ tenantId: input.tenantId, clientId: client.id, petId, staffId: input.staffId, serviceType: input.serviceType, scheduledStart: input.scheduledStart, scheduledEnd: capacity.scheduledEnd, notes, status: "pending", workflowState: "scheduled" });
    return { success: true, appointmentId: (result as any).insertId as number, preview: true };
  }),
});

const migrationRouter = router({
  listJobs: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(migrationJobs)
        .where(eq(migrationJobs.tenantId, input.tenantId))
        .orderBy(desc(migrationJobs.createdAt));
    }),

  createJob: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      type: z.enum(["csv_import", "moego_extract"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(migrationJobs).values({ tenantId: input.tenantId, type: input.type });
      return { success: true };
    }),

  importClients: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      jobId: z.number(),
      records: z.array(z.object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().optional(),
        phone: z.string().optional(),
        moegoClientId: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(migrationJobs).set({ status: "running", startedAt: new Date(), totalRecords: input.records.length }).where(eq(migrationJobs.id, input.jobId));
      let processed = 0;
      let errors = 0;
      const errorMessages: string[] = [];
      for (const rec of input.records) {
        try {
          await db.insert(clients).values({ tenantId: input.tenantId, ...rec }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
          processed++;
        } catch (e: unknown) {
          errors++;
          errorMessages.push(`Row ${processed + errors}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      await db.update(migrationJobs).set({
        status: errors === input.records.length ? "failed" : "completed",
        processedRecords: processed,
        errorCount: errors,
        errorLog: errorMessages.slice(0, 100).join("\n"),
        completedAt: new Date(),
      }).where(eq(migrationJobs.id, input.jobId));
      return { success: true, processed, errors };
    }),
});

// ─── Email Campaigns ────────────────────────────────────────────────────────
const emailCampaignsRouter = router({
  list: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: emailCampaigns.id,
          name: emailCampaigns.name,
          subject: emailCampaigns.subject,
          status: emailCampaigns.status,
          scheduledAt: emailCampaigns.scheduledAt,
          sentAt: emailCampaigns.sentAt,
          totalRecipients: emailCampaigns.totalRecipients,
          totalSent: emailCampaigns.totalSent,
          totalOpened: emailCampaigns.totalOpened,
          totalClicked: emailCampaigns.totalClicked,
          audienceFilter: emailCampaigns.audienceFilter,
          createdAt: emailCampaigns.createdAt,
          updatedAt: emailCampaigns.updatedAt,
        })
        .from(emailCampaigns)
        .where(eq(emailCampaigns.tenantId, input.tenantId))
        .orderBy(desc(emailCampaigns.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [c] = await db
        .select()
        .from(emailCampaigns)
        .where(eq(emailCampaigns.id, input.id))
        .limit(1);
      return c ?? null;
    }),

  create: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      name: z.string(),
      subject: z.string(),
      previewText: z.string().optional(),
      bodyHtml: z.string(),
      bodyText: z.string().optional(),
      audienceFilter: z.string().optional(), // JSON string
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(emailCampaigns).values({
        tenantId: input.tenantId,
        name: input.name,
        subject: input.subject,
        previewText: input.previewText ?? null,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText ?? null,
        audienceFilter: input.audienceFilter ?? null,
        status: "draft",
      });
      return { success: true, id: (result as any).insertId as number };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      subject: z.string().optional(),
      previewText: z.string().optional(),
      bodyHtml: z.string().optional(),
      bodyText: z.string().optional(),
      audienceFilter: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      if (fields.name !== undefined) updateData.name = fields.name;
      if (fields.subject !== undefined) updateData.subject = fields.subject;
      if (fields.previewText !== undefined) updateData.previewText = fields.previewText;
      if (fields.bodyHtml !== undefined) updateData.bodyHtml = fields.bodyHtml;
      if (fields.bodyText !== undefined) updateData.bodyText = fields.bodyText;
      if (fields.audienceFilter !== undefined) updateData.audienceFilter = fields.audienceFilter;
      await db.update(emailCampaigns).set(updateData).where(eq(emailCampaigns.id, id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Only allow deleting drafts or cancelled campaigns
      await db.delete(emailCampaignSends).where(eq(emailCampaignSends.campaignId, input.id));
      await db.delete(emailCampaigns).where(eq(emailCampaigns.id, input.id));
      return { success: true };
    }),

  getAudiencePreview: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      audienceFilter: z.string(), // JSON: { type: "all_active" | "membership_holders" | "inactive_8w" | "inactive_12w" | "all_clients" }
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { count: 0, sampleNames: [] };

      let filter: { type: string } = { type: "all_active" };
      try { filter = JSON.parse(input.audienceFilter); } catch {}

      // Get unsubscribed emails for this tenant
      const unsubRows = await db
        .select({ email: emailUnsubscribes.email })
        .from(emailUnsubscribes)
        .where(eq(emailUnsubscribes.tenantId, input.tenantId));
      const unsubEmails = new Set(unsubRows.map(r => r.email.toLowerCase()));

      let conditions: ReturnType<typeof and>[] = [
        eq(clients.tenantId, input.tenantId) as any,
      ];

      if (filter.type === "all_active") {
        conditions.push(eq(clients.status, "active") as any);
      } else if (filter.type === "membership_holders") {
        // Will join with memberships below
      } else if (filter.type === "inactive_8w") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 56);
        conditions.push(eq(clients.status, "inactive") as any);
      } else if (filter.type === "inactive_12w") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 84);
        conditions.push(eq(clients.status, "inactive") as any);
      }
      // all_clients: no extra status filter

      let rows: Array<{ firstName: string; lastName: string; email: string | null }>;

      if (filter.type === "membership_holders") {
        rows = await db
          .selectDistinct({
            firstName: clients.firstName,
            lastName: clients.lastName,
            email: clients.email,
          })
          .from(clients)
          .innerJoin(memberships, and(eq(memberships.clientId, clients.id), eq(memberships.status, "active")))
          .where(eq(clients.tenantId, input.tenantId));
      } else {
        rows = await db
          .select({
            firstName: clients.firstName,
            lastName: clients.lastName,
            email: clients.email,
          })
          .from(clients)
          .where(and(...conditions));
      }

      // Filter out those without email or who have unsubscribed
      const eligible = rows.filter(r => r.email && !unsubEmails.has(r.email.toLowerCase()));
      const sampleNames = eligible.slice(0, 5).map(r => `${r.firstName} ${r.lastName}`);
      return { count: eligible.length, sampleNames };
    }),

  schedule: protectedProcedure
    .input(z.object({
      id: z.number(),
      scheduledAt: z.string(), // ISO date string
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(emailCampaigns).set({
        status: "scheduled",
        scheduledAt: new Date(input.scheduledAt),
      }).where(eq(emailCampaigns.id, input.id));
      return { success: true };
    }),

  send: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      campaignId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [campaign] = await db
        .select()
        .from(emailCampaigns)
        .where(eq(emailCampaigns.id, input.campaignId))
        .limit(1);
      if (!campaign) throw new Error("Campaign not found");
      if (campaign.status === "sent") throw new Error("Campaign already sent");

      // Get unsubscribed emails
      const unsubRows = await db
        .select({ email: emailUnsubscribes.email })
        .from(emailUnsubscribes)
        .where(eq(emailUnsubscribes.tenantId, input.tenantId));
      const unsubEmails = new Set(unsubRows.map(r => r.email.toLowerCase()));

      // Determine audience
      let filter: { type: string } = { type: "all_active" };
      try { if (campaign.audienceFilter) filter = JSON.parse(campaign.audienceFilter); } catch {}

      let audienceRows: Array<{ id: number; firstName: string; lastName: string; email: string | null }>;

      if (filter.type === "membership_holders") {
        audienceRows = await db
          .selectDistinct({
            id: clients.id,
            firstName: clients.firstName,
            lastName: clients.lastName,
            email: clients.email,
          })
          .from(clients)
          .innerJoin(memberships, and(eq(memberships.clientId, clients.id), eq(memberships.status, "active")))
          .where(eq(clients.tenantId, input.tenantId));
      } else if (filter.type === "inactive_8w" || filter.type === "inactive_12w") {
        audienceRows = await db
          .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email })
          .from(clients)
          .where(and(eq(clients.tenantId, input.tenantId), eq(clients.status, "inactive")));
      } else if (filter.type === "all_active") {
        audienceRows = await db
          .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email })
          .from(clients)
          .where(and(eq(clients.tenantId, input.tenantId), eq(clients.status, "active")));
      } else {
        // all_clients
        audienceRows = await db
          .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email })
          .from(clients)
          .where(eq(clients.tenantId, input.tenantId));
      }

      // Filter out no-email and unsubscribed
      const eligible = audienceRows.filter(r => r.email && !unsubEmails.has(r.email.toLowerCase()));

      // Mark campaign as sending
      await db.update(emailCampaigns).set({
        status: "sending",
        totalRecipients: eligible.length,
      }).where(eq(emailCampaigns.id, input.campaignId));

      // Lazy import email helper
      const { sendEmail } = await import("./email.js");

      let sent = 0;
      const unsubscribeBaseUrl = process.env.VITE_APP_URL ?? "https://groomingsos-mqzfsvzv.manus.space";

      for (const recipient of eligible) {
        if (!recipient.email) continue;
        // Build unsubscribe token (simple base64 of email+tenantId)
        const unsubToken = Buffer.from(`${input.tenantId}:${recipient.email}`).toString("base64url");
        const unsubLink = `${unsubscribeBaseUrl}/unsubscribe?token=${unsubToken}`;

        // Inject unsubscribe footer into HTML
        const htmlWithUnsub = campaign.bodyHtml.replace(
          "</body>",
          `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center">
            <a href="${unsubLink}" style="color:#9ca3af">Unsubscribe</a> from these emails.
          </div></body>`
        ) + (campaign.bodyHtml.includes("</body>") ? "" : `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center"><a href="${unsubLink}" style="color:#9ca3af">Unsubscribe</a></div>`);

        // Insert send record
        const [sendResult] = await db.insert(emailCampaignSends).values({
          campaignId: input.campaignId,
          clientId: recipient.id,
          email: recipient.email,
          status: "pending",
        });
        const sendId = (sendResult as any).insertId as number;

        const ok = await sendEmail({
          to: recipient.email,
          subject: campaign.subject,
          html: htmlWithUnsub,
        });

        if (ok) {
          sent++;
          await db.update(emailCampaignSends).set({ status: "sent", sentAt: new Date() }).where(eq(emailCampaignSends.id, sendId));
        } else {
          await db.update(emailCampaignSends).set({ status: "failed", errorMessage: "Send failed" }).where(eq(emailCampaignSends.id, sendId));
        }
      }

      // Mark campaign as sent
      await db.update(emailCampaigns).set({
        status: "sent",
        sentAt: new Date(),
        totalSent: sent,
      }).where(eq(emailCampaigns.id, input.campaignId));

      await notifyOwner({
        title: `Campaign Sent: ${campaign.name}`,
        content: `Sent to ${sent} of ${eligible.length} recipients.`,
      }).catch(() => {});

      return { success: true, sent, total: eligible.length };
    }),

  getStats: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [campaign] = await db
        .select({
          id: emailCampaigns.id,
          name: emailCampaigns.name,
          subject: emailCampaigns.subject,
          status: emailCampaigns.status,
          sentAt: emailCampaigns.sentAt,
          totalRecipients: emailCampaigns.totalRecipients,
          totalSent: emailCampaigns.totalSent,
          totalOpened: emailCampaigns.totalOpened,
          totalClicked: emailCampaigns.totalClicked,
        })
        .from(emailCampaigns)
        .where(eq(emailCampaigns.id, input.campaignId))
        .limit(1);
      if (!campaign) return null;

      const sends = await db
        .select({
          status: emailCampaignSends.status,
          email: emailCampaignSends.email,
          sentAt: emailCampaignSends.sentAt,
          openedAt: emailCampaignSends.openedAt,
          clickedAt: emailCampaignSends.clickedAt,
        })
        .from(emailCampaignSends)
        .where(eq(emailCampaignSends.campaignId, input.campaignId))
        .orderBy(desc(emailCampaignSends.sentAt));

      return { campaign, sends };
    }),
});

// ─── SMS Router ──────────────────────────────────────────────────────────────
const smsRouter = router({
  getPickupRecipients: operationalProcedure
    .input(z.object({ appointmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [appointment] = await db.select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        clientId: appointments.clientId,
        workflowState: appointments.workflowState,
        petName: pets.name,
      }).from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .where(eq(appointments.id, input.appointmentId))
        .limit(1);
      if (!appointment) throw new Error("Appointment not found");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, appointment.id);
      if (appointment.workflowState !== "complete") throw new Error("Pickup messages are available after the dog is marked complete");
      const [client] = await db.select({ firstName: clients.firstName, lastName: clients.lastName, phone: clients.phone })
        .from(clients)
        .where(and(eq(clients.id, appointment.clientId), eq(clients.tenantId, appointment.tenantId)))
        .limit(1);
      if (!client) throw new Error("Client not found");
      const additionalContacts = await db.select({ id: clientContacts.id, name: clientContacts.name, phone: clientContacts.phone, relationship: clientContacts.relationship })
        .from(clientContacts)
        .where(and(eq(clientContacts.clientId, appointment.clientId), eq(clientContacts.tenantId, appointment.tenantId)))
        .orderBy(asc(clientContacts.name));
      const recipients = [
        ...(client.phone ? [{ id: 0, type: "primary" as const, name: `${client.firstName} ${client.lastName}`.trim(), phone: client.phone, relationship: "Primary contact" }] : []),
        ...additionalContacts.map(contact => ({ id: contact.id, type: "additional" as const, name: contact.name, phone: contact.phone, relationship: contact.relationship ?? "Additional contact" })),
      ];
      return { appointment: { id: appointment.id, petName: appointment.petName ?? "your dog" }, recipients };
    }),

  sendPickupMessage: operationalProcedure
    .input(z.object({ appointmentId: z.number(), recipientType: z.enum(["primary", "additional"]), contactId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [appointment] = await db.select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        clientId: appointments.clientId,
        workflowState: appointments.workflowState,
        petName: pets.name,
      }).from(appointments)
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .where(eq(appointments.id, input.appointmentId))
        .limit(1);
      if (!appointment) throw new Error("Appointment not found");
      await requireApprovedStaffAppointmentAccess(db, ctx.user, appointment.id);
      if (appointment.workflowState !== "complete") throw new Error("Pickup messages are available after the dog is marked complete");
      const [client] = await db.select({ firstName: clients.firstName, lastName: clients.lastName, phone: clients.phone })
        .from(clients)
        .where(and(eq(clients.id, appointment.clientId), eq(clients.tenantId, appointment.tenantId)))
        .limit(1);
      if (!client) throw new Error("Client not found");
      let recipient: { name: string; phone: string } | null = null;
      if (input.recipientType === "primary") {
        recipient = client.phone ? { name: `${client.firstName} ${client.lastName}`.trim(), phone: client.phone } : null;
      } else if (input.contactId) {
        const [contact] = await db.select({ name: clientContacts.name, phone: clientContacts.phone })
          .from(clientContacts)
          .where(and(eq(clientContacts.id, input.contactId), eq(clientContacts.clientId, appointment.clientId), eq(clientContacts.tenantId, appointment.tenantId)))
          .limit(1);
        recipient = contact ?? null;
      }
      if (!recipient?.phone) throw new Error("The selected contact does not have a phone number");
      const body = buildReadyForPickupSms({ clientFirstName: recipient.name.split(" ")[0] || "there", petName: appointment.petName ?? "your dog" });
      const result = await sendSms(recipient.phone, body);
      await db.insert(smsLogs).values({ tenantId: appointment.tenantId, clientId: appointment.clientId, appointmentId: appointment.id, toNumber: recipient.phone, body, twilioSid: result.sid, status: result.success ? "sent" : "failed", type: "ready_pickup", direction: "outbound", errorMessage: result.error });
      return { ...result, recipientName: recipient.name, body };
    }),

  send: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number().optional(),
      appointmentId: z.number().optional(),
      toNumber: z.string(),
      body: z.string().min(1).max(1600),
      type: z.enum(["reminder", "confirmation", "ready_pickup", "payment_failed", "custom", "campaign"]).default("custom"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const result = await sendSms(input.toNumber, input.body);
      if (db) {
        await db.insert(smsLogs).values({
          tenantId: input.tenantId,
          clientId: input.clientId,
          appointmentId: input.appointmentId,
          toNumber: input.toNumber,
          body: input.body,
          twilioSid: result.sid,
          status: result.success ? "sent" : "failed",
          type: input.type,
          direction: "outbound",
          errorMessage: result.error,
        });
      }
      return result;
    }),

  sendToClient: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
      appointmentId: z.number().optional(),
      templateType: z.enum(["reminder", "confirmation", "ready_pickup", "payment_failed", "custom"]),
      customMessage: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [client] = await db.select({ firstName: clients.firstName, phone: clients.phone }).from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client?.phone) throw new Error("Client has no phone number");
      let petName = "your dog";
      if (input.appointmentId) {
        const [appt] = await db.select({ petName: pets.name }).from(appointments).leftJoin(pets, eq(appointments.petId, pets.id)).where(eq(appointments.id, input.appointmentId)).limit(1);
        if (appt?.petName) petName = appt.petName;
      }
      let body = "";
      if (input.templateType === "ready_pickup") {
        body = buildReadyForPickupSms({ clientFirstName: client.firstName ?? "there", petName });
      } else if (input.templateType === "custom" && input.customMessage) {
        body = buildCustomSms({ clientFirstName: client.firstName ?? "there", petName, message: input.customMessage });
      } else if (input.templateType === "reminder") {
        body = buildAppointmentReminderSms({ clientFirstName: client.firstName ?? "there", petName, date: "your upcoming appointment", time: "", groomer: "our team" });
      } else {
        body = input.customMessage ?? "";
      }
      const result = await sendSms(client.phone, body);
      await db.insert(smsLogs).values({ tenantId: input.tenantId, clientId: input.clientId, appointmentId: input.appointmentId, toNumber: client.phone, body, twilioSid: result.sid, status: result.success ? "sent" : "failed", type: input.templateType, direction: "outbound", errorMessage: result.error });
      return result;
    }),

  getLogs: protectedProcedure
    .input(z.object({ tenantId: z.number().default(1), limit: z.number().default(50), clientId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(smsLogs.tenantId, input.tenantId)];
      if (input.clientId) conditions.push(eq(smsLogs.clientId, input.clientId));
      return db.select({
        id: smsLogs.id, toNumber: smsLogs.toNumber, body: smsLogs.body,
        status: smsLogs.status, type: smsLogs.type, direction: smsLogs.direction, replyIntent: smsLogs.replyIntent, processedAt: smsLogs.processedAt, reviewAction: smsLogs.reviewAction, processedByUserId: smsLogs.processedByUserId, sentAt: smsLogs.sentAt,
        twilioSid: smsLogs.twilioSid, errorMessage: smsLogs.errorMessage,
        clientId: smsLogs.clientId, appointmentId: smsLogs.appointmentId,
        clientName: sql`CONCAT(${clients.firstName}, ' ', ${clients.lastName})`,
        appointmentStart: appointments.scheduledStart,
        appointmentStatus: appointments.status,
        petName: pets.name,
        reviewerName: users.name,
      }).from(smsLogs)
        .leftJoin(clients, eq(smsLogs.clientId, clients.id))
        .leftJoin(appointments, eq(smsLogs.appointmentId, appointments.id))
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(users, eq(smsLogs.processedByUserId, users.id))
        .where(and(...conditions)).orderBy(desc(smsLogs.sentAt)).limit(input.limit);
    }),

  reviewInboundReply: protectedProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      smsLogId: z.number(),
      action: z.enum(["confirm", "cancel"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [reply] = await db.select({
        id: smsLogs.id,
        appointmentId: smsLogs.appointmentId,
        direction: smsLogs.direction,
        replyIntent: smsLogs.replyIntent,
        processedAt: smsLogs.processedAt,
      }).from(smsLogs).where(and(eq(smsLogs.id, input.smsLogId), eq(smsLogs.tenantId, input.tenantId))).limit(1);

      if (!reply || reply.direction !== "inbound" || !reply.appointmentId) {
        throw new Error("This reply is not linked to an appointment for review");
      }
      if (reply.processedAt) throw new Error("This reply has already been reviewed");
      if (reply.replyIntent !== input.action) throw new Error("Staff action must match the recognised reply intent");

      await db.update(appointments)
        .set(input.action === "cancel" ? { status: "cancelled", workflowState: "cancelled" } : { status: "confirmed" })
        .where(eq(appointments.id, reply.appointmentId));
      await db.update(smsLogs).set({
        processedAt: new Date(),
        reviewAction: input.action,
        processedByUserId: ctx.user.id,
      }).where(eq(smsLogs.id, reply.id));
      return { success: true, appointmentId: reply.appointmentId, action: input.action };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
// ─── Family Groups ────────────────────────────────────────────────────────────
const familyRouter = router({
  getFamily: protectedProcedure
    .input(z.object({ petId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [pet] = await db.select({ familyGroupId: pets.familyGroupId }).from(pets).where(eq(pets.id, input.petId)).limit(1);
      if (!pet?.familyGroupId) return [];
      return db.select({
        id: pets.id, name: pets.name, breed: pets.breed,
        clientId: pets.clientId, alertLevel: pets.alertLevel,
      }).from(pets).where(eq(pets.familyGroupId, pet.familyGroupId));
    }),

  linkPets: operationalProcedure
    .input(z.object({ petIds: z.array(z.number()).min(2), groupName: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const portalStaff = await requireApprovedFamilyLinkStaff(db, ctx.user);
      const uniquePetIds = Array.from(new Set(input.petIds));
      if (uniquePetIds.length < 2) throw new Error("Choose two different dogs to create a family link");
      const existingPets = await db.select({ id: pets.id, tenantId: pets.tenantId, familyGroupId: pets.familyGroupId })
        .from(pets).where(inArray(pets.id, uniquePetIds));
      if (existingPets.length !== uniquePetIds.length) throw new Error("One or more selected dogs are unavailable");
      const tenantIds = Array.from(new Set(existingPets.map(pet => pet.tenantId)));
      if (tenantIds.length !== 1 || (portalStaff && tenantIds[0] !== portalStaff.tenantId)) {
        throw new Error("Family links are limited to dogs in your salon");
      }
      const tenantId = tenantIds[0]!;
      const existingGroupId = existingPets.find(p => p.familyGroupId)?.familyGroupId;
      let groupId = existingGroupId;
      if (!groupId) {
        const [result] = await db.insert(familyGroups).values({ tenantId, name: input.groupName ?? null });
        groupId = (result as any).insertId;
      }
      const resolvedGroupId = Number(groupId);
      if (!Number.isInteger(resolvedGroupId) || resolvedGroupId <= 0) throw new Error("Unable to create the family group");
      await db.update(pets).set({ familyGroupId: resolvedGroupId }).where(inArray(pets.id, uniquePetIds));
      const linkedAppointments = await db.select({
        id: appointments.id,
        scheduledStart: appointments.scheduledStart,
        scheduledEnd: appointments.scheduledEnd,
        sessionId: appointments.sessionId,
        status: appointments.status,
        workflowState: appointments.workflowState,
        petFamilyGroupId: pets.familyGroupId,
      }).from(appointments)
        .innerJoin(pets, eq(appointments.petId, pets.id))
        .where(and(eq(pets.familyGroupId, resolvedGroupId), eq(appointments.tenantId, tenantId)));
      const timeAlignments = getFamilySessionTimeAlignments(linkedAppointments);
      for (const alignment of timeAlignments) {
        await db.update(appointments).set({
          scheduledStart: alignment.scheduledStart,
          scheduledEnd: alignment.scheduledEnd,
        }).where(eq(appointments.id, alignment.appointmentId));
      }
      return { groupId: resolvedGroupId, alignedAppointmentIds: timeAlignments.map(alignment => alignment.appointmentId) };
    }),

  unlinkPet: operationalProcedure
    .input(z.object({ petId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await requireApprovedStaffPetAccess(db, ctx.user, input.petId);
      await db.update(pets).set({ familyGroupId: null }).where(eq(pets.id, input.petId));
      return { success: true };
    }),

  searchPets: operationalProcedure
    .input(z.object({ query: z.string().min(1), excludePetId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const portalStaff = await requireApprovedFamilyLinkStaff(db, ctx.user);
      const q = `%${input.query}%`;
      return db.select({
        id: pets.id, name: pets.name, breed: pets.breed,
        clientId: pets.clientId,
        clientFirstName: clients.firstName, clientLastName: clients.lastName,
        familyGroupId: pets.familyGroupId,
      }).from(pets)
        .leftJoin(clients, eq(pets.clientId, clients.id))
        .where(and(
          portalStaff ? eq(pets.tenantId, portalStaff.tenantId) : sql`1=1`,
          sql`(${pets.name} LIKE ${q} OR CONCAT(${clients.firstName}, ' ', ${clients.lastName}) LIKE ${q})`,
          input.excludePetId ? sql`${pets.id} != ${input.excludePetId}` : sql`1=1`
        ))
        .limit(10);
    }),
});

// ─── Client portal ────────────────────────────────────────────────────────────
// Client links are manually generated by an administrator. The raw access token
// is returned once to the administrator and only its hash is persisted.
async function buildClientPortalPayload(db: any, access: {
  clientId: number;
  tenantId: number;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  salonName: string;
  salonPhone: string | null;
  salonEmail: string | null;
}) {
  const [clientPets, clientAppointments, clientMemberships, clientReports] = await Promise.all([
    db.select({ id: pets.id, name: pets.name, breed: pets.breed, species: pets.species, status: pets.status })
      .from(pets)
      .where(and(eq(pets.clientId, access.clientId), eq(pets.tenantId, access.tenantId)))
      .orderBy(asc(pets.name)),
    db.select({
      id: appointments.id,
      scheduledStart: appointments.scheduledStart,
      scheduledEnd: appointments.scheduledEnd,
      serviceType: appointments.serviceType,
      status: appointments.status,
      workflowState: appointments.workflowState,
      petName: pets.name,
      staffName: staff.name,
    })
      .from(appointments)
      .innerJoin(pets, eq(appointments.petId, pets.id))
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .where(and(
        eq(appointments.clientId, access.clientId),
        eq(appointments.tenantId, access.tenantId),
        eq(pets.clientId, access.clientId),
        eq(pets.tenantId, access.tenantId),
      ))
      .orderBy(desc(appointments.scheduledStart))
      .limit(30),
    db.select({ id: memberships.id, petId: memberships.petId, name: memberships.name, tier: memberships.tier, status: memberships.status, nextBillingDate: memberships.nextBillingDate })
      .from(memberships)
      .where(and(eq(memberships.clientId, access.clientId), eq(memberships.tenantId, access.tenantId)))
      .orderBy(asc(memberships.name)),
    db.select({
      id: groomingReports.id,
      petId: groomingReports.petId,
      petName: pets.name,
      appointmentDate: appointments.scheduledStart,
      overallRating: groomingReports.overallRating,
      mood: groomingReports.mood,
      additionalNote: groomingReports.additionalNote,
      beforePhotoUrl: groomingReports.beforePhotoUrl,
      afterPhotoUrl: groomingReports.afterPhotoUrl,
      recommendedFrequencyWeeks: groomingReports.recommendedFrequencyWeeks,
      sentAt: groomingReports.sentAt,
    })
      .from(groomingReports)
      .innerJoin(appointments, eq(groomingReports.appointmentId, appointments.id))
      .innerJoin(pets, eq(groomingReports.petId, pets.id))
      .where(and(
        eq(groomingReports.tenantId, access.tenantId),
        eq(appointments.clientId, access.clientId),
        eq(appointments.tenantId, access.tenantId),
        eq(pets.clientId, access.clientId),
        eq(pets.tenantId, access.tenantId),
        eq(groomingReports.status, "sent"),
      ))
      .orderBy(desc(appointments.scheduledStart))
      .limit(12),
  ]);

  return {
    salon: { name: access.salonName, phone: access.salonPhone, email: access.salonEmail },
    client: { firstName: access.clientFirstName, lastName: access.clientLastName, email: access.clientEmail, phone: access.clientPhone },
    pets: clientPets,
    appointments: clientAppointments,
    memberships: clientMemberships,
    groomingCards: clientReports,
  };
}

const clientPortalRouter = router({
  getAccessStatus: adminProcedure
    .input(z.object({ clientId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [client] = await db.select({ id: clients.id, tenantId: clients.tenantId })
        .from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client || client.tenantId !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });

      const [access] = await db.select({
        id: clientPortalAccess.id,
        status: clientPortalAccess.status,
        expiresAt: clientPortalAccess.expiresAt,
        lastAccessedAt: clientPortalAccess.lastAccessedAt,
        createdAt: clientPortalAccess.createdAt,
      })
        .from(clientPortalAccess)
        .where(and(eq(clientPortalAccess.clientId, client.id), eq(clientPortalAccess.tenantId, client.tenantId)))
        .orderBy(desc(clientPortalAccess.createdAt))
        .limit(1);
      if (!access) return null;
      if (access.status === "active" && isClientPortalLinkExpired(access.expiresAt)) {
        await db.update(clientPortalAccess).set({ status: "expired" }).where(eq(clientPortalAccess.id, access.id));
        return { ...access, status: "expired" as const };
      }
      return access;
    }),

  getAccountStatus: adminProcedure
    .input(z.object({ clientId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [client] = await db.select({
        id: clients.id,
        tenantId: clients.tenantId,
        email: clients.email,
        portalLoginEmail: clients.portalLoginEmail,
        portalAccountStatus: clients.portalAccountStatus,
        portalSetupExpiresAt: clients.portalSetupExpiresAt,
        portalLastSignedInAt: clients.portalLastSignedInAt,
        portalSessionVersion: clients.portalSessionVersion,
        hasPortalPassword: sql<boolean>`CASE WHEN ${clients.portalPasswordHash} IS NULL THEN false ELSE true END`,
      })
        .from(clients)
        .where(eq(clients.id, input.clientId))
        .limit(1);
      if (!client || client.tenantId !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      const setupExpired = client.portalAccountStatus === "setup_pending" && client.portalSetupExpiresAt !== null && client.portalSetupExpiresAt.getTime() <= Date.now();
      return { ...client, setupExpired };
    }),

  revokeAccess: adminProcedure
    .input(z.object({ clientId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [client] = await db.select({ id: clients.id, tenantId: clients.tenantId })
        .from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client || client.tenantId !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      const result = await db.update(clientPortalAccess).set({ status: "revoked" }).where(and(
        eq(clientPortalAccess.clientId, client.id),
        eq(clientPortalAccess.tenantId, client.tenantId),
        eq(clientPortalAccess.status, "active"),
      ));
      return { revoked: Number((result as any).affectedRows ?? 0) > 0 };
    }),

  revokeAccount: adminProcedure
    .input(z.object({ clientId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [client] = await db.select({ id: clients.id, tenantId: clients.tenantId })
        .from(clients)
        .where(eq(clients.id, input.clientId))
        .limit(1);
      if (!client || client.tenantId !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      await db.update(clients).set({
        portalAccountStatus: "revoked",
        portalPasswordHash: null,
        portalSetupTokenHash: null,
        portalSetupExpiresAt: null,
        portalSessionVersion: sql`${clients.portalSessionVersion} + 1`,
        updatedAt: new Date(),
      }).where(eq(clients.id, client.id));
      return { revoked: true } as const;
    }),

  issueAccessLink: adminProcedure
    .input(z.object({ clientId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [client] = await db.select({ id: clients.id, tenantId: clients.tenantId })
        .from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client || client.tenantId !== 1) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }

      const access = createClientPortalToken();
      await db.transaction(async (tx) => {
        await tx.update(clientPortalAccess)
          .set({ status: "revoked" })
          .where(and(
            eq(clientPortalAccess.clientId, client.id),
            eq(clientPortalAccess.tenantId, client.tenantId),
            eq(clientPortalAccess.status, "active"),
          ));
        await tx.insert(clientPortalAccess).values({
          tenantId: client.tenantId,
          clientId: client.id,
          tokenHash: access.tokenHash,
          status: "active",
          expiresAt: access.expiresAt,
          issuedByUserId: ctx.user.id,
        });
      });

      const forwardedProto = ctx.req.headers["x-forwarded-proto"];
      const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(",")[0]?.trim() || ctx.req.protocol || "https";
      const host = ctx.req.get("host");
      const baseUrl = host ? `${protocol}://${host}` : "https://groomingsos-mqzfsvzv.manus.space";
      return {
        portalUrl: `${baseUrl}/portal/${access.token}`,
        expiresAt: access.expiresAt,
        manualShareOnly: true as const,
      };
    }),

  issueAccountSetupLink: adminProcedure
    .input(z.object({ clientId: z.number().int().positive(), email: z.string().trim().email().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [client] = await db.select({ id: clients.id, tenantId: clients.tenantId, email: clients.email, portalLoginEmail: clients.portalLoginEmail })
        .from(clients)
        .where(eq(clients.id, input.clientId))
        .limit(1);
      if (!client || client.tenantId !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });

      const loginEmail = (input.email ?? client.portalLoginEmail ?? client.email ?? "").trim().toLowerCase();
      if (!loginEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Add a client email before creating a portal account setup link" });

      const [matchingPortalLogin] = await db.select({ id: clients.id })
        .from(clients)
        .where(and(
          eq(clients.tenantId, client.tenantId),
          eq(clients.portalLoginEmail, loginEmail),
          ne(clients.id, client.id),
        ))
        .limit(1);
      if (matchingPortalLogin) {
        throw new TRPCError({ code: "CONFLICT", message: "This email is already assigned to another client portal account" });
      }

      const setup = createClientPortalToken();
      await db.update(clients).set({
        portalLoginEmail: loginEmail,
        portalAccountStatus: "setup_pending",
        portalPasswordHash: null,
        portalSetupTokenHash: setup.tokenHash,
        portalSetupExpiresAt: setup.expiresAt,
        portalSessionVersion: sql`${clients.portalSessionVersion} + 1`,
        updatedAt: new Date(),
      }).where(eq(clients.id, client.id));

      const forwardedProto = ctx.req.headers["x-forwarded-proto"];
      const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(",")[0]?.trim() || ctx.req.protocol || "https";
      const host = ctx.req.get("host");
      const baseUrl = host ? `${protocol}://${host}` : "https://groomingsos-mqzfsvzv.manus.space";
      return {
        setupUrl: `${baseUrl}/portal/setup/${setup.token}`,
        loginEmail,
        expiresAt: setup.expiresAt,
        manualShareOnly: true as const,
      };
    }),

  getSetup: publicProcedure
    .input(z.object({ token: z.string().min(32).max(128) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [client] = await db.select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
        portalLoginEmail: clients.portalLoginEmail,
        portalSetupExpiresAt: clients.portalSetupExpiresAt,
        portalSessionVersion: clients.portalSessionVersion,
        salonName: tenants.name,
      })
        .from(clients)
        .innerJoin(tenants, eq(clients.tenantId, tenants.id))
        .where(and(
          eq(clients.portalSetupTokenHash, hashClientPortalToken(input.token)),
          eq(clients.portalAccountStatus, "setup_pending"),
        ))
        .limit(1);
      if (!client) throw new TRPCError({ code: "UNAUTHORIZED", message: "This client portal setup link is invalid or no longer active." });
      if (!client.portalSetupExpiresAt || client.portalSetupExpiresAt.getTime() <= Date.now()) {
        await db.update(clients).set({
          portalAccountStatus: "not_enabled",
          portalLoginEmail: null,
          portalPasswordHash: null,
          portalSetupTokenHash: null,
          portalSetupExpiresAt: null,
          portalSessionVersion: sql`${clients.portalSessionVersion} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(clients.id, client.id),
          eq(clients.portalSetupTokenHash, hashClientPortalToken(input.token)),
          eq(clients.portalAccountStatus, "setup_pending"),
        ));
        throw new TRPCError({ code: "UNAUTHORIZED", message: "This client portal setup link has expired. Please ask the salon for a new link." });
      }
      return {
        client: { firstName: client.firstName, lastName: client.lastName, email: client.portalLoginEmail },
        salon: { name: client.salonName },
        expiresAt: client.portalSetupExpiresAt,
      };
    }),

  completeSetup: publicProcedure
    .input(z.object({ token: z.string().min(32).max(128), password: z.string().min(8).max(128) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [client] = await db.select({
        id: clients.id,
        tenantId: clients.tenantId,
        firstName: clients.firstName,
        lastName: clients.lastName,
        portalLoginEmail: clients.portalLoginEmail,
        portalSetupExpiresAt: clients.portalSetupExpiresAt,
        portalSessionVersion: clients.portalSessionVersion,
      })
        .from(clients)
        .where(and(
          eq(clients.portalSetupTokenHash, hashClientPortalToken(input.token)),
          eq(clients.portalAccountStatus, "setup_pending"),
        ))
        .limit(1);
      if (!client) throw new TRPCError({ code: "UNAUTHORIZED", message: "This client portal setup link is invalid or no longer active." });
      if (!client.portalSetupExpiresAt || client.portalSetupExpiresAt.getTime() <= Date.now()) {
        await db.update(clients).set({
          portalAccountStatus: "not_enabled",
          portalLoginEmail: null,
          portalPasswordHash: null,
          portalSetupTokenHash: null,
          portalSetupExpiresAt: null,
          portalSessionVersion: sql`${clients.portalSessionVersion} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(clients.id, client.id),
          eq(clients.portalSetupTokenHash, hashClientPortalToken(input.token)),
          eq(clients.portalAccountStatus, "setup_pending"),
        ));
        throw new TRPCError({ code: "UNAUTHORIZED", message: "This client portal setup link has expired. Please ask the salon for a new link." });
      }
      const passwordHash = await bcrypt.hash(input.password, 12);
      const setupResult = await db.update(clients).set({
        portalPasswordHash: passwordHash,
        portalAccountStatus: "active",
        portalSetupTokenHash: null,
        portalSetupExpiresAt: null,
        portalLastSignedInAt: new Date(),
        portalSessionVersion: client.portalSessionVersion + 1,
        updatedAt: new Date(),
      }).where(and(
        eq(clients.id, client.id),
        eq(clients.portalSetupTokenHash, hashClientPortalToken(input.token)),
        eq(clients.portalAccountStatus, "setup_pending"),
        gt(clients.portalSetupExpiresAt, new Date()),
      ));
      if (Number((setupResult as any).affectedRows ?? 0) !== 1) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "This client portal setup link is invalid or no longer active." });
      }
      await setClientPortalSessionCookie(ctx.res, ctx.req, { clientId: client.id, tenantId: client.tenantId, sessionVersion: client.portalSessionVersion + 1 });
      return { success: true, client: { firstName: client.firstName, lastName: client.lastName, email: client.portalLoginEmail } };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().trim().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const loginEmail = input.email.trim().toLowerCase();
      const [client] = await db.select({
        id: clients.id,
        tenantId: clients.tenantId,
        firstName: clients.firstName,
        lastName: clients.lastName,
        email: clients.email,
        portalLoginEmail: clients.portalLoginEmail,
        portalPasswordHash: clients.portalPasswordHash,
        portalAccountStatus: clients.portalAccountStatus,
        portalSessionVersion: clients.portalSessionVersion,
      })
        .from(clients)
        .where(and(
          eq(clients.tenantId, 1),
          eq(clients.portalLoginEmail, loginEmail),
        ))
        .limit(1);
      if (!client || client.portalAccountStatus !== "active" || !client.portalPasswordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(input.password, client.portalPasswordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      await db.update(clients).set({ portalLastSignedInAt: new Date(), updatedAt: new Date() }).where(eq(clients.id, client.id));
      await setClientPortalSessionCookie(ctx.res, ctx.req, { clientId: client.id, tenantId: client.tenantId, sessionVersion: client.portalSessionVersion });
      return { success: true, client: { firstName: client.firstName, lastName: client.lastName, email: client.portalLoginEmail } };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    const session = await readClientPortalSession(ctx.req);
    if (!session) return null;
    const db = await getDb();
    if (!db) return null;
    const [client] = await db.select({
      id: clients.id,
      tenantId: clients.tenantId,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
        portalLoginEmail: clients.portalLoginEmail,
        portalAccountStatus: clients.portalAccountStatus,
        portalSessionVersion: clients.portalSessionVersion,
      })
      .from(clients)
      .where(and(
        eq(clients.id, session.clientId),
        eq(clients.tenantId, session.tenantId),
        eq(clients.portalAccountStatus, "active"),
        eq(clients.portalSessionVersion, session.sessionVersion),
      ))
      .limit(1);
    if (!client) return null;
    return { clientId: client.id, tenantId: client.tenantId, firstName: client.firstName, lastName: client.lastName, email: client.portalLoginEmail ?? client.email };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    clearClientPortalSessionCookie(ctx.res, ctx.req);
    return { success: true } as const;
  }),

  getPortal: publicProcedure
    .input(z.object({ token: z.string().min(32).max(128) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [access] = await db.select({
        id: clientPortalAccess.id,
        clientId: clientPortalAccess.clientId,
        tenantId: clientPortalAccess.tenantId,
        status: clientPortalAccess.status,
        expiresAt: clientPortalAccess.expiresAt,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientEmail: clients.email,
        clientPhone: clients.phone,
        salonName: tenants.name,
        salonPhone: tenants.phone,
        salonEmail: tenants.email,
      })
        .from(clientPortalAccess)
        .innerJoin(clients, eq(clientPortalAccess.clientId, clients.id))
        .innerJoin(tenants, eq(clientPortalAccess.tenantId, tenants.id))
        .where(and(
          eq(clientPortalAccess.tokenHash, hashClientPortalToken(input.token)),
          eq(clientPortalAccess.status, "active"),
          eq(clients.tenantId, clientPortalAccess.tenantId),
        ))
        .limit(1);

      if (!access) throw new TRPCError({ code: "UNAUTHORIZED", message: "This client portal link is invalid or no longer active." });
      if (isClientPortalLinkExpired(access.expiresAt)) {
        await db.update(clientPortalAccess).set({ status: "expired" }).where(eq(clientPortalAccess.id, access.id));
        throw new TRPCError({ code: "UNAUTHORIZED", message: "This client portal link has expired. Please ask the salon for a new link." });
      }

      await db.update(clientPortalAccess).set({ lastAccessedAt: new Date() }).where(eq(clientPortalAccess.id, access.id));

      return buildClientPortalPayload(db, access);
    }),

  getMyPortal: publicProcedure.query(async ({ ctx }) => {
    const session = await readClientPortalSession(ctx.req);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to your client portal" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const [access] = await db.select({
      clientId: clients.id,
      tenantId: clients.tenantId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientEmail: clients.email,
      clientPhone: clients.phone,
      portalSessionVersion: clients.portalSessionVersion,
      salonName: tenants.name,
      salonPhone: tenants.phone,
      salonEmail: tenants.email,
    })
      .from(clients)
      .innerJoin(tenants, eq(clients.tenantId, tenants.id))
      .where(and(
        eq(clients.id, session.clientId),
        eq(clients.tenantId, session.tenantId),
        eq(clients.portalAccountStatus, "active"),
        eq(clients.portalSessionVersion, session.sessionVersion),
      ))
      .limit(1);
    if (!access) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to your client portal" });
    return buildClientPortalPayload(db, access);
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  calendar: calendarRouter,
  workflow: workflowRouter,
  tracker: trackerRouter,
  clients: clientsRouter,
  pets: petsRouter,
  staff: staffRouter,
  memberships: membershipsRouter,
  groomNotes: groomStyleNotesRouter,
  groomingReports: groomingReportsRouter,
  groomStylePresets: groomStylePresetsRouter,
  pricing: pricingRouter,
  retail: retailRouter,
  analytics: analyticsRouter,
  analyticsExt: analyticsRouterExtended,
  migration: migrationRouter,
  settings: settingsRouter,
  stripeBilling: stripeBillingRouter,
  onlineBooking: onlineBookingRouter,
  campaigns: emailCampaignsRouter,
  family: familyRouter,
  sms: smsRouter,
  clientPortal: clientPortalRouter,
  workflowReview: workflowReviewRouter,
});

export type AppRouter = typeof appRouter;
