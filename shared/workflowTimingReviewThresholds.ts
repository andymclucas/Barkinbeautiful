import { getPetWeightBand, type PetWeightBand } from "./onlineBookingWeightEligibility";

export type TimingReviewThresholds = {
  bathMinutes: number;
  dryMinutes: number;
  groomMinutes: number;
  totalMinutes: number;
};

export type TimingReviewThresholdRule = TimingReviewThresholds & {
  scope: "default" | "size" | "breed";
  scopeKey: string;
  petSize?: string | null;
  breedName?: string | null;
};

export const DEFAULT_TIMING_REVIEW_THRESHOLDS: TimingReviewThresholds = {
  bathMinutes: 90,
  dryMinutes: 75,
  groomMinutes: 150,
  totalMinutes: 240,
};

export const TIMING_REVIEW_SIZE_PRESETS: readonly Pick<PetWeightBand, "id" | "label" | "minKg" | "maxKg">[] = [
  { id: "small", label: "Small", minKg: 0, maxKg: 10 },
  { id: "small_medium", label: "Small–Medium", minKg: 11, maxKg: 13 },
  { id: "medium", label: "Medium", minKg: 14, maxKg: 16 },
  { id: "large", label: "Large", minKg: 17, maxKg: 25 },
  { id: "extra_large", label: "Extra Large", minKg: 26, maxKg: 35 },
  { id: "giant", label: "Giant", minKg: 36, maxKg: 80 },
];

export function normaliseTimingReviewBreed(breed: string | null | undefined) {
  return (breed ?? "").trim().toLocaleLowerCase("en-AU").replace(/\s+/g, " ");
}

export function getTimingReviewScopeKey(input: { scope: "default" | "size" | "breed"; petSize?: string | null; breedName?: string | null }) {
  if (input.scope === "default") return "default";
  if (input.scope === "size") return `size:${input.petSize ?? ""}`;
  return `breed:${normaliseTimingReviewBreed(input.breedName)}`;
}

export function resolveTimingReviewThreshold(input: { breed?: string | null; weightKg?: number | string | null; weight?: number | string | null }, rules: readonly TimingReviewThresholdRule[]) {
  const breedKey = normaliseTimingReviewBreed(input.breed);
  const breedRule = breedKey ? rules.find((rule) => rule.scope === "breed" && normaliseTimingReviewBreed(rule.breedName) === breedKey) : undefined;
  if (breedRule) return { thresholds: toThresholds(breedRule), source: `Breed override · ${breedRule.breedName}`, scope: "breed" as const };

  const size = getPetWeightBand(input.weightKg ?? input.weight);
  const sizeRule = size ? rules.find((rule) => rule.scope === "size" && rule.petSize === size.id) : undefined;
  if (sizeRule && size) return { thresholds: toThresholds(sizeRule), source: `Size preset · ${size.label}`, scope: "size" as const };

  const defaultRule = rules.find((rule) => rule.scope === "default");
  if (defaultRule) return { thresholds: toThresholds(defaultRule), source: "Salon default", scope: "default" as const };
  return { thresholds: DEFAULT_TIMING_REVIEW_THRESHOLDS, source: "Standard default", scope: "default" as const };
}

function toThresholds(rule: TimingReviewThresholdRule): TimingReviewThresholds {
  return {
    bathMinutes: rule.bathMinutes,
    dryMinutes: rule.dryMinutes,
    groomMinutes: rule.groomMinutes,
    totalMinutes: rule.totalMinutes,
  };
}
