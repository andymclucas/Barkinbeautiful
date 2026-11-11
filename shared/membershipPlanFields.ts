/**
 * Reading a membership plan's tier, service and weight band the way a
 * person typed them.
 *
 * Andy, 12/11/2026: "Have added a new membership but it's not showing in
 * the drop down to add to a client. Ensure that any new memberships that
 * are added show up for the relevant weight band of dog."
 *
 * The Pricing screen took all three as free text, with placeholders that
 * read "e.g. Gold", "e.g. Classic" and "e.g. Small 0–10kg". Lauren's plan
 * was saved as tier "Gold +", service "Classic", band "small 0-10kg". The
 * Add membership picker compares the band to the dog's band id ("small")
 * exactly, so the plan matched no dog at all. Had it got that far, "Gold +"
 * is not a tier a membership can store either.
 *
 * The form now offers pick-lists and the server stores the clean value,
 * but plans already saved keep whatever was typed, so the picker reads
 * every plan through these too.
 */
import {
  MEMBERSHIP_WEIGHT_BANDS,
  type MembershipWeightClass,
} from "./membershipPackages";

export const PLAN_TIERS = ["diamond", "platinum", "gold", "silver", "bronze"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];
export const PLAN_SERVICES = ["classic", "styled"] as const;
export type PlanService = (typeof PLAN_SERVICES)[number];

// "MED14-17KG" → "med 14 17 kg": letters and digits split, so "med" is a word.
const squash = (value: unknown) =>
  String(value ?? "").toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ").trim();

/** "Gold +", "GOLD VIP", "gold" → "gold". Null when no tier is named. */
export function normalisePlanTier(value: unknown): PlanTier | null {
  const words = squash(value).split(" ");
  return PLAN_TIERS.find((tier) => words.includes(tier)) ?? null;
}

/** "Classic", "classic clip", "Styled" → the service. Null when neither. */
export function normalisePlanService(value: unknown): PlanService | null {
  const words = squash(value).split(" ");
  const hits = PLAN_SERVICES.filter((service) => words.includes(service));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * A typed weight band → the band id the picker compares against.
 *
 * - blank → { band: null, recognised: true }: the plan suits any dog.
 * - "small", "Small 0–10kg", "SML-10kg", "11-13kg", "Extra Large" → the id.
 * - anything else → { band: null, recognised: false }.
 *
 * The kilo figures win over the words when both are present, because
 * "Small-Medium 11–13kg" contains "small" and "medium" and only the
 * numbers say which band it is.
 */
export function normalisePlanWeightBand(
  value: unknown,
): { band: MembershipWeightClass | null; recognised: boolean } {
  const raw = String(value ?? "").trim();
  if (raw === "") return { band: null, recognised: true };

  const exact = MEMBERSHIP_WEIGHT_BANDS.find((b) => b.id === raw);
  if (exact) return { band: exact.id, recognised: true };

  // Kilos: "0-10", "11–13kg", "36 - 80 kg", or a lone "10kg" as in SML-10kg.
  const numbers = (raw.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (numbers.length >= 2) {
    const [lo, hi] = numbers;
    const band = MEMBERSHIP_WEIGHT_BANDS.find((b) => b.minKg === lo && b.maxKg === hi);
    if (band) return { band: band.id, recognised: true };
  }
  if (numbers.length === 1) {
    const band = MEMBERSHIP_WEIGHT_BANDS.find((b) => b.maxKg === numbers[0]);
    if (band) return { band: band.id, recognised: true };
  }

  const text = squash(raw);
  const has = (re: RegExp) => re.test(text);
  if (has(/\b(extra large|xl|xlarge)\b/)) return { band: "extra_large", recognised: true };
  if (has(/\bgiant\b/)) return { band: "giant", recognised: true };
  if (has(/\b(small medium|sml med|sm med)\b/)) return { band: "small_medium", recognised: true };
  if (has(/\blarge\b/)) return { band: "large", recognised: true };
  if (has(/\b(medium|med)\b/)) return { band: "medium", recognised: true };
  if (has(/\b(small|sml|sm)\b/)) return { band: "small", recognised: true };
  return { band: null, recognised: false };
}

export type CleanPlanFields =
  | { ok: true; tier: PlanTier; serviceVariant: PlanService; weightBand: MembershipWeightClass | null }
  | { ok: false; reason: string };

/** What the server stores when a plan is saved — or why it can't be. */
export function cleanPlanFields(input: {
  tier: unknown;
  serviceVariant?: unknown;
  weightBand?: unknown;
}): CleanPlanFields {
  const tier = normalisePlanTier(input.tier);
  if (!tier) {
    return { ok: false, reason: `Tier must be one of ${PLAN_TIERS.join(", ")}. The plan's name is what the client sees, so call it anything you like.` };
  }
  // No service given has always meant classic.
  const serviceText = String(input.serviceVariant ?? "").trim();
  const serviceVariant = serviceText === "" ? "classic" : normalisePlanService(serviceText);
  if (!serviceVariant) return { ok: false, reason: "Service must be classic or styled." };
  const band = normalisePlanWeightBand(input.weightBand);
  if (!band.recognised) {
    return { ok: false, reason: `Weight band "${String(input.weightBand)}" isn't one of the salon's bands. Pick one, or leave it as any weight.` };
  }
  return { ok: true, tier, serviceVariant, weightBand: band.band };
}
