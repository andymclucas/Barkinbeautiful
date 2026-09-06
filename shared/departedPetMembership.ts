import { getPetWeightBand } from "./onlineBookingWeightEligibility";

export type ReplacementPetCandidate = {
  id: number;
  weightKg?: number | string | null;
  weight?: number | string | null;
  status?: "active" | "departed";
};

function recordedWeight(pet: ReplacementPetCandidate) {
  return pet.weightKg ?? pet.weight ?? null;
}

export function getReplacementWeightBand(pet: ReplacementPetCandidate) {
  return getPetWeightBand(recordedWeight(pet));
}

export function isEligibleMembershipReplacement(
  departedPet: ReplacementPetCandidate,
  replacementPet: ReplacementPetCandidate,
) {
  if (departedPet.id === replacementPet.id || replacementPet.status === "departed") return false;
  const departedBand = getReplacementWeightBand(departedPet);
  const replacementBand = getReplacementWeightBand(replacementPet);
  return Boolean(departedBand && replacementBand && departedBand.id === replacementBand.id);
}

export function replacementEligibilityMessage(
  departedPet: ReplacementPetCandidate,
  replacementPet: ReplacementPetCandidate,
) {
  const departedBand = getReplacementWeightBand(departedPet);
  const replacementBand = getReplacementWeightBand(replacementPet);
  if (!departedBand || !replacementBand) {
    return "Both pets need a recorded weight within the configured 0–80kg bands before a membership can be transferred.";
  }
  if (!isEligibleMembershipReplacement(departedPet, replacementPet)) {
    return `This membership is for the ${departedBand.label} band; the replacement pet is in the ${replacementBand.label} band.`;
  }
  return `Eligible: both pets are in the ${departedBand.label} band.`;
}

export function getDepartedMembershipBillingImpact(
  action: "transfer" | "remove",
  pricePerCycle: string | null | undefined,
  nextBillingDate: Date | string | null | undefined,
) {
  if (action === "remove") {
    return "Future billing stops immediately. No further membership payments will be scheduled.";
  }
  const price = Number(pricePerCycle ?? 0).toFixed(2);
  const nextBilling = nextBillingDate ? new Date(nextBillingDate).toLocaleDateString("en-AU") : null;
  return `Future billing continues at $${price}/wk${nextBilling ? `; next billing remains ${nextBilling}` : ""}.`;
}
