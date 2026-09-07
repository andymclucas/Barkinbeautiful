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
