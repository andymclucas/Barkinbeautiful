import { getMembershipWeightBand } from "./membershipPackages";

// Automatic duration for full grooms (classic/styled) and FFT (same time \u2014
// it's blow-drying time either way), based on the dog's recorded weight.
// Staff can always manually override the end time afterward (e.g. an easy
// job on a large dog, or overlapping a booking on purpose) \u2014 this is a
// starting suggestion, not a hard rule.
const DURATION_MINUTES_BY_WEIGHT_CLASS: Record<string, number> = {
  small: 60,
  small_medium: 60,
  medium: 90,
  large: 120,
  extra_large: 180,
  giant: 180,
};

/**
 * The services a length can be worked out for.
 *
 * Exported so the booking dialog can say which it is. The other five —
 * bath, deshed, nail trim, daycare, other — get no suggestion, and that
 * is 205 of 1,295 upcoming bookings, so roughly one in six is booked
 * with an empty finish time. Telling somebody a length was "suggested
 * from the dogs' size" when none was is what made that puzzling as well
 * as tedious.
 */
export const AUTO_DURATION_SERVICES: ReadonlySet<string> = new Set([
  "classic_groom", "styled_groom", "fft",
]);

const AUTO_DURATION_SERVICE_TYPES = AUTO_DURATION_SERVICES;

/**
 * The dog's recorded size band, used when no weight is on file.
 *
 * The table above is already keyed by band id, and `pets.size_band`
 * already holds one — there was simply no way in except through a
 * weight. 4,478 active dogs have a band and no weight, and for every
 * one of them the suggestion returned null and the end time stayed
 * empty.
 *
 * Andy, 04/11/2026, having watched a two-dog booking refuse to create:
 * "Fix the Ends field bug." The booking had a 42 kg dog and one with a
 * band but no weight, and one unknown weight is enough to abandon the
 * whole total — see getAutoDurationMinutesForPets.
 */
export function getAutoDurationMinutes(
  serviceType: string,
  weightKg: string | number | null | undefined,
  sizeBand?: string | null,
): number | null {
  if (!AUTO_DURATION_SERVICE_TYPES.has(serviceType)) return null;
  const band = getMembershipWeightBand(weightKg);
  // A recorded weight still wins: it is the better evidence, and a band
  // set by hand years ago should not override a figure from the scales.
  if (band) return DURATION_MINUTES_BY_WEIGHT_CLASS[band.id] ?? null;
  const fallback = (sizeBand ?? "").trim();
  if (!fallback) return null;
  return DURATION_MINUTES_BY_WEIGHT_CLASS[fallback] ?? null;
}

// For a multi-pet (family) booking, each dog is groomed in turn within the
// one appointment block, so the suggested duration is each dog's time added
// together. If any selected dog's weight is unknown, no total is suggested
// (falls back to whatever staff enters manually) rather than guessing.
/** A dog, as much of it as the duration needs to know. */
export type DurationPet = {
  weightKg?: string | number | null;
  sizeBand?: string | null;
};

export function getAutoDurationMinutesForPets(
  serviceType: string,
  pets: readonly (DurationPet | string | number | null | undefined)[],
): number | null {
  if (!AUTO_DURATION_SERVICE_TYPES.has(serviceType) || pets.length === 0) return null;
  let total = 0;
  for (const pet of pets) {
    // A bare weight is still accepted, so older callers keep working.
    const minutes = pet !== null && typeof pet === "object"
      ? getAutoDurationMinutes(serviceType, pet.weightKg, pet.sizeBand)
      : getAutoDurationMinutes(serviceType, pet);
    /*
     * Still all-or-nothing. One dog whose size is genuinely unknown
     * makes the TOTAL a guess, and a wrong end time on a family booking
     * blocks a groomer's afternoon. Falling back to the band is about
     * dogs whose size IS known and merely unweighed.
     */
    if (minutes === null) return null;
    total += minutes;
  }
  return total;
}
