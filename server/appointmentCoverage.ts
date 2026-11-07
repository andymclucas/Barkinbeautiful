/**
 * Which of a booking's dogs are covered by which of the client's plans.
 *
 * Extracted from server/routers.ts on 07/11/2026 so that
 * server/routers/waitlist.ts can use it. Importing it from the monolith
 * would have been a cycle — routers.ts imports the waitlist router to
 * compose it into appRouter — and CLAUDE.md §5 would rather new surface
 * left that file than joined it.
 *
 * The reasoning inside is unchanged from where it sat before.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { memberships, membershipPets } from "../drizzle/schema";
import {
  resolveAppointmentMembershipCoverage, type AppointmentService,
} from "@shared/appointmentMembershipCoverage";

export async function getAppointmentMembershipCoverage(db: any, tenantId: number, clientId: number, petIds: number[], serviceType: AppointmentService) {
  /**
   * EVERY plan on this client, not just the ones whose primary dog is in
   * this booking.
   *
   * The old `inArray(memberships.petId, petIds)` meant booking only the
   * SECOND dog of an "x2" plan fetched no membership at all, so the dog
   * was priced as though the client had no plan. A client has a handful
   * of plans, so dropping the filter costs nothing and the resolver
   * decides which dogs each one covers.
   */
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
  )).orderBy(asc(memberships.id));
  if (activeMemberships.length === 0) {
    return resolveAppointmentMembershipCoverage(petIds, serviceType, []);
  }
  const assigned = await db.select({
    membershipId: membershipPets.membershipId,
    petId: membershipPets.petId,
  }).from(membershipPets).where(and(
    eq(membershipPets.tenantId, tenantId),
    inArray(membershipPets.membershipId, activeMemberships.map((m: { id: number }) => m.id)),
  ));
  const coveredByMembership = new Map<number, number[]>();
  for (const row of assigned) {
    const list = coveredByMembership.get(row.membershipId) ?? [];
    list.push(row.petId);
    coveredByMembership.set(row.membershipId, list);
  }
  return resolveAppointmentMembershipCoverage(petIds, serviceType, activeMemberships.map(
    (m: { id: number }) => ({ ...m, coveredPetIds: coveredByMembership.get(m.id) ?? [] }),
  ));
}

