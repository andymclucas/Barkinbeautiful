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

const AUTO_DURATION_SERVICE_TYPES = new Set(["classic_groom", "styled_groom", "fft"]);

export function getAutoDurationMinutes(serviceType: string, weightKg: string | number | null | undefined): number | null {
  if (!AUTO_DURATION_SERVICE_TYPES.has(serviceType)) return null;
  const band = getMembershipWeightBand(weightKg);
  if (!band) return null;
  return DURATION_MINUTES_BY_WEIGHT_CLASS[band.id] ?? null;
}

// For a multi-pet (family) booking, each dog is groomed in turn within the
// one appointment block, so the suggested duration is each dog's time added
// together. If any selected dog's weight is unknown, no total is suggested
// (falls back to whatever staff enters manually) rather than guessing.
export function getAutoDurationMinutesForPets(serviceType: string, weightsKg: (string | number | null | undefined)[]): number | null {
  if (!AUTO_DURATION_SERVICE_TYPES.has(serviceType) || weightsKg.length === 0) return null;
  let total = 0;
  for (const weight of weightsKg) {
    const minutes = getAutoDurationMinutes(serviceType, weight);
    if (minutes === null) return null;
    total += minutes;
  }
  return total;
}
