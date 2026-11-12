/**
 * Which clients and dogs are members — the VIP badge on their profile.
 *
 * Andy, 12/11/2026: "All memberships need to have the VIP badge on their
 * profile across the entire platform."
 *
 * A PROFILE fact, deliberately not a booking fact. The calendar card's VIP
 * means "this groom is covered" and reads the booking's own membership link
 * (shared/membershipMark.ts) — 128 of 713 upcoming bookings belong to a
 * member but are not linked, and those are charged. Wherever a client or a
 * dog is shown as a person or a pet, this is the rule instead.
 *
 * - A dog is VIP when an active plan names it, as the plan's primary dog
 *   or as one of the dogs it covers (shared/vipPetIds.ts — the second dog
 *   on an x2 plan).
 * - A client is VIP when they hold any active plan.
 *
 * Active only. A paused plan, one waiting for payment, or a cancelled one
 * is not a member being looked after right now.
 */
import { and, eq, inArray } from "drizzle-orm";
import { memberships, membershipPets } from "../drizzle/schema";
import { vipPetIds } from "../shared/vipPetIds";

const ids = (values: readonly (number | null | undefined)[]) =>
  Array.from(new Set(values.filter((v): v is number => typeof v === "number" && Number.isFinite(v))));

export async function loadVipMembers(
  db: any,
  tenantId: number,
  wanted: { clientIds?: readonly (number | null | undefined)[]; petIds?: readonly (number | null | undefined)[] },
): Promise<{ clients: Set<number>; pets: Set<number> }> {
  const clientIds = ids(wanted.clientIds ?? []);
  const petIds = ids(wanted.petIds ?? []);
  const clients = new Set<number>();
  let pets = new Set<number>();

  if (clientIds.length > 0) {
    const rows = await db.select({ clientId: memberships.clientId }).from(memberships)
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active"), inArray(memberships.clientId, clientIds)));
    for (const row of rows as { clientId: number | null }[]) if (row.clientId) clients.add(row.clientId);
  }

  if (petIds.length > 0) {
    const [primaries, covered] = await Promise.all([
      db.select({ petId: memberships.petId }).from(memberships)
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active"), inArray(memberships.petId, petIds))),
      db.select({ petId: membershipPets.petId }).from(membershipPets)
        .innerJoin(memberships, eq(memberships.id, membershipPets.membershipId))
        .where(and(eq(membershipPets.tenantId, tenantId), eq(memberships.status, "active"), inArray(membershipPets.petId, petIds))),
    ]);
    pets = vipPetIds({
      primaryPetIds: (primaries as { petId: number | null }[]).map((m) => m.petId),
      coveredPetIds: (covered as { petId: number | null }[]).map((m) => m.petId),
    });
  }

  return { clients, pets };
}
