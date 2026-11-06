import { PET_WEIGHT_BANDS, getPetWeightBand } from "./onlineBookingWeightEligibility";

export type ReplacementPetCandidate = {
  id: number;
  weightKg?: number | string | null;
  weight?: number | string | null;
  /**
   * `pets.size_band` — the only size 4,478 active dogs have, and the
   * reason this guard could not be left as "a weight or nothing".
   */
  sizeBand?: string | null;
  status?: "active" | "departed";
};

/** The first weight actually on file, treating blanks as absent. */
function recordedWeight(pet: ReplacementPetCandidate) {
  for (const value of [pet.weightKg, pet.weight]) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return null;
}

/**
 * A dog's size band, from the scales if it has been weighed and from
 * its recorded band if not.
 *
 * ## Why it does not just call getPetWeightBand
 *
 * `getPetWeightBand(null)` answers **Small**. `Number(null)` is 0, the
 * Small band starts at 0, and nothing in between rejects it — so a dog
 * with no weight on file silently reads as a small dog. Passing
 * `undefined` or `""` correctly answers null; only `null` is wrong,
 * and `null` is exactly what the database returns.
 *
 * That made `isEligibleMembershipReplacement` return TRUE for two dogs
 * that had never been weighed — both "Small" — so a 40 kg dog could
 * take over a 5 kg dog's plan, while `replacementEligibilityMessage`
 * announced "Eligible: both pets are in the Small band." The test
 * above it looked like it covered this, but it only ever passed a null
 * weight against a 17 kg dog, so it was caught by the band mismatch
 * and not by the missing weight at all.
 *
 * The weight is still read through `getPetWeightBand`, so a weighed
 * dog lands in exactly the band it did before. The fix is only that a
 * dog with no weight no longer pretends to have one.
 *
 * ## Why the band is a fallback and not a refusal
 *
 * Refusing outright would be correct and useless: most of the salon's
 * dogs have no weight, so the transfer would start failing for the
 * households most likely to need it. `pets.size_band` carries the same
 * ids as these bands, and `getAutoDurationMinutes` already reaches for
 * it for the same 4,478 dogs and for the same reason. A recorded
 * weight still wins — it is the better evidence, and a band set by
 * hand years ago should not override a figure from the scales.
 *
 * Deliberately NOT fixed in `getPetWeightBand` itself. That helper also
 * gates online booking, where the same null reads as Small and lets an
 * unweighed dog through to be priced as a 0 kg dog. Correcting it there
 * would make all 4,478 ineligible at once, on a public form, which is
 * Andy's decision and not a side effect of this one.
 */
export function getReplacementWeightBand(pet: ReplacementPetCandidate) {
  const weight = recordedWeight(pet);
  if (weight !== null) return getPetWeightBand(weight);
  const band = (pet.sizeBand ?? "").trim();
  return band ? PET_WEIGHT_BANDS.find((candidate) => candidate.id === band) ?? null : null;
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
  const nextBilling = nextBillingDate ? new Date(nextBillingDate).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" }) : null;
  return `Future billing continues at $${price}/wk${nextBilling ? `; next billing remains ${nextBilling}` : ""}.`;
}
