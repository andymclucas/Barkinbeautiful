export const ONLINE_BOOKING_SERVICE_TYPES = [
  "classic_groom",
  "styled_groom",
  "bath_only",
  "deshed",
  "nail_trim",
  "daycare",
  "other",
] as const;

export type OnlineBookingServiceType = (typeof ONLINE_BOOKING_SERVICE_TYPES)[number];

export type PetWeightBand = {
  id: "small" | "small_medium" | "medium" | "large" | "extra_large" | "giant";
  label: string;
  minKg: number;
  maxKg: number;
};

export const PET_WEIGHT_BANDS: readonly PetWeightBand[] = [
  { id: "small", label: "Small", minKg: 0, maxKg: 10 },
  { id: "small_medium", label: "Small–Medium", minKg: 11, maxKg: 13 },
  { id: "medium", label: "Medium", minKg: 14, maxKg: 16 },
  { id: "large", label: "Large", minKg: 17, maxKg: 25 },
  { id: "extra_large", label: "Extra Large", minKg: 26, maxKg: 35 },
  { id: "giant", label: "Giant", minKg: 36, maxKg: 80 },
] as const;

const ONLINE_BOOKING_SERVICE_LABELS: Record<OnlineBookingServiceType, string> = {
  classic_groom: "Classic Groom",
  styled_groom: "Styled Groom",
  bath_only: "Bath Only",
  deshed: "De-shed",
  nail_trim: "Nail Trim",
  daycare: "Daycare",
  other: "Other service",
};

export function getPetWeightBand(weightKg: number | string | null | undefined): PetWeightBand | null {
  if (typeof weightKg === "string" && weightKg.trim() === "") return null;
  const numericWeight = typeof weightKg === "number" ? weightKg : Number(weightKg);
  if (!Number.isFinite(numericWeight)) return null;
  return PET_WEIGHT_BANDS.find(band => numericWeight >= band.minKg && numericWeight <= band.maxKg) ?? null;
}

export function isEligibleOnlineBookingService(serviceType: string, weightKg: number | string | null | undefined): boolean {
  return Boolean(getPetWeightBand(weightKg)) && ONLINE_BOOKING_SERVICE_TYPES.includes(serviceType as OnlineBookingServiceType);
}

export function getWeightBandDisplay(band: PetWeightBand): string {
  return `${band.label} · ${band.minKg}–${band.maxKg}kg`;
}

export function getEligibleOnlineBookingServices(weightKg: number | string | null | undefined) {
  const band = getPetWeightBand(weightKg);
  if (!band) return [];
  const bandDisplay = getWeightBandDisplay(band);
  return ONLINE_BOOKING_SERVICE_TYPES.filter(type => type !== "daycare").map(value => ({
    value,
    label: `${ONLINE_BOOKING_SERVICE_LABELS[value]} · ${bandDisplay}`,
  }));
}

export function getWeightEligibilityMessage(weightKg: number | string | null | undefined): string {
  const band = getPetWeightBand(weightKg);
  if (band) return `Showing services for ${getWeightBandDisplay(band)}.`;
  return "Enter your dog’s weight (0–80kg) to see the services available for their size.";
}
