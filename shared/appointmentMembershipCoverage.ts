export type AppointmentService = "classic_groom" | "styled_groom" | "bath_only" | "fft" | "nail_trim" | "daycare" | "deshed" | "other";

export type ActivePetMembership = {
  id: number;
  /** The plan's primary dog — memberships.pet_id. Always covered. */
  petId: number;
  name: string;
  tier: string;
  serviceType: "classic" | "styled";
  status: string;
  bookingSuspended: boolean;
  /**
   * Every OTHER dog the plan covers, from membership_pets.
   *
   * A plan named "x2" or "x3" is one fee for several dogs, but only the
   * primary lived on the membership row. So the second and third dogs
   * were priced as though they had no plan at all — Allyson Warner pays
   * $78 a cycle for three styled grooms and Groomigo charged for two of
   * them. 31 dogs across 27 plans, found 28/10/2026.
   *
   * Optional, and the primary stands without it, because this is empty
   * for any plan nobody has assigned dogs to yet.
   */
  coveredPetIds?: readonly number[];
};

export type AppointmentMembershipCoverage = {
  fullyCovered: boolean;
  coveredPetIds: number[];
  uncoveredPetIds: number[];
  membershipByPetId: Record<number, ActivePetMembership>;
};

function membershipCoversService(membershipService: ActivePetMembership["serviceType"], appointmentService: AppointmentService) {
  if (appointmentService === "classic_groom") return membershipService === "classic" || membershipService === "styled";
  if (appointmentService === "styled_groom") return membershipService === "styled";
  return false;
}

export function resolveAppointmentMembershipCoverage(
  petIds: number[],
  appointmentService: AppointmentService,
  memberships: ActivePetMembership[],
): AppointmentMembershipCoverage {
  const membershipByPetId: Record<number, ActivePetMembership> = {};
  const usable = memberships.filter((membership) =>
    membership.status === "active"
    && !membership.bookingSuspended
    && membershipCoversService(membership.serviceType, appointmentService));

  /**
   * TWO passes, and the order matters.
   *
   * A dog can be the primary of its own plan and also listed on a
   * household plan. Taking them in one pass made the winner depend on
   * which row the database happened to return first — there is no
   * ORDER BY on that query — so a dog whose own plan was paused could
   * still come back covered by an older household plan that merely
   * lists it. "Oldest plan in the household beats the dog's own plan"
   * is not a rule anybody chose.
   *
   * So: every plan's PRIMARY dog is claimed first, then the assigned
   * dogs fill the gaps. A dog's own plan always wins, and `??=` keeps
   * first-wins within each pass, which is what this did before.
   */
  for (const membership of usable) {
    if (typeof membership.petId === "number" && Number.isFinite(membership.petId)) {
      membershipByPetId[membership.petId] ??= membership;
    }
  }
  for (const membership of usable) {
    for (const petId of membership.coveredPetIds ?? []) {
      if (typeof petId === "number" && Number.isFinite(petId)) membershipByPetId[petId] ??= membership;
    }
  }

  const uniquePetIds = Array.from(new Set(petIds));
  const coveredPetIds = uniquePetIds.filter((petId) => membershipByPetId[petId] !== undefined);
  const uncoveredPetIds = uniquePetIds.filter((petId) => membershipByPetId[petId] === undefined);
  return {
    fullyCovered: uniquePetIds.length > 0 && uncoveredPetIds.length === 0,
    coveredPetIds,
    uncoveredPetIds,
    membershipByPetId,
  };
}

/**
 * Coverage for a booking whose dogs are not all having the same service.
 *
 * Lauren, 18/11/2026, booking three dogs from one household: "wont let me
 * edit the service per dog, 1 style, 1 classic, 1 bath". The booking form
 * had one service for the whole family, and coverage was worked out for
 * that one service.
 *
 * Whether a plan covers a groom depends on the service (a Classic plan
 * does not pay for a styled cut), so each dog is judged against ITS OWN
 * service. Dogs having the same service are resolved together, exactly
 * as before; the answers are then joined. `fullyCovered` keeps its
 * meaning — every dog on the booking is covered — because that is the
 * switch that prices the whole booking at nil.
 *
 * With every dog on one service this returns exactly what
 * resolveAppointmentMembershipCoverage returns for that service.
 */
export function resolveCoverageByService(
  petServices: readonly { petId: number; service: AppointmentService }[],
  memberships: ActivePetMembership[],
): AppointmentMembershipCoverage {
  // First mention wins: one dog, one service.
  const serviceByPet = new Map<number, AppointmentService>();
  for (const entry of petServices) if (!serviceByPet.has(entry.petId)) serviceByPet.set(entry.petId, entry.service);

  const petsByService = new Map<AppointmentService, number[]>();
  for (const [petId, service] of serviceByPet) {
    petsByService.set(service, [...(petsByService.get(service) ?? []), petId]);
  }

  const membershipByPetId: Record<number, ActivePetMembership> = {};
  const coveredPetIds: number[] = [];
  const uncoveredPetIds: number[] = [];
  for (const [service, petIds] of petsByService) {
    const part = resolveAppointmentMembershipCoverage(petIds, service, memberships);
    for (const petId of part.coveredPetIds) {
      coveredPetIds.push(petId);
      membershipByPetId[petId] = part.membershipByPetId[petId];
    }
    uncoveredPetIds.push(...part.uncoveredPetIds);
  }
  // In the order the dogs were given, so callers that list them read the same.
  const order = [...serviceByPet.keys()];
  const byOrder = (a: number, b: number) => order.indexOf(a) - order.indexOf(b);
  return {
    fullyCovered: order.length > 0 && uncoveredPetIds.length === 0,
    coveredPetIds: coveredPetIds.sort(byOrder),
    uncoveredPetIds: uncoveredPetIds.sort(byOrder),
    membershipByPetId,
  };
}

/** The service one dog is having: its own if it was given one, else the booking's. */
export function serviceForPet<T extends string>(
  petId: number | string,
  bookingService: T,
  serviceByPetId: Readonly<Record<string, T | undefined>> | null | undefined,
): T {
  return serviceByPetId?.[String(petId)] ?? bookingService;
}

/**
 * What an appointment is priced at once coverage is known.
 *
 * A membership groom carries no price — the weekly payment is the revenue —
 * so a covered booking is always "0.00", whatever figure the dialog sent.
 * Extras done on the day are still invoiced; they are add-on rows, not this.
 *
 * Extracted on 13/10/2026 because the rule was three copies of a ternary in
 * routers.ts — createAppointment, createRecurringAppointments and
 * createMultiPetAppointment — and the contract test pinned it by matching
 * the literal text `price: coverage.fullyCovered ? "0.00" : input.price`.
 * When the multi-pet path gained a per-dog figure that line changed there
 * and the assertion quietly went on matching the OTHER two, so the busiest
 * booking path lost its guard while the suite stayed green.
 *
 * `requested` is whatever the caller asked for, already resolved down to a
 * single figure for this dog.
 */
export function priceForCoveredAppointment(
  fullyCovered: boolean,
  requested: string | null | undefined,
): string | undefined {
  // Zero, explicitly — never the requested figure. Billing a member for a
  // groom their membership already paid for is the failure that matters.
  if (fullyCovered) return "0.00";
  return requested ?? undefined;
}

/**
 * What a dog ADDED to an existing family booking is priced at.
 *
 * Null, not zero: the booking it joins may already carry a combined
 * price for the family, and inventing a per-pet charge would bill the
 * same groom twice. The one exception is a dog the membership covers,
 * which is explicitly zero for the same reason every covered groom is —
 * the weekly payment is the revenue.
 *
 * A function rather than a ternary in the router because the rule was
 * pinned by a test that read routers.ts and looked for the literal text
 * `price: null`. That assertion could not tell the difference between
 * the rule being right and the rule being absent, and it broke the
 * moment the covered case was added (CLAUDE.md §7).
 */
export function priceForAddedFamilyPet(covered: boolean): string | null {
  return covered ? "0.00" : null;
}
