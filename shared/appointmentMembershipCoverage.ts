export type AppointmentService = "classic_groom" | "styled_groom" | "bath_only" | "fft" | "nail_trim" | "daycare" | "deshed" | "other";

export type ActivePetMembership = {
  id: number;
  petId: number;
  name: string;
  tier: string;
  serviceType: "classic" | "styled";
  status: string;
  bookingSuspended: boolean;
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
  for (const membership of memberships) {
    if (membership.status !== "active" || membership.bookingSuspended || !membershipCoversService(membership.serviceType, appointmentService)) continue;
    membershipByPetId[membership.petId] ??= membership;
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
