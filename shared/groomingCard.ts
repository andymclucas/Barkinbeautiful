/**
 * How a grooming card reads to a client.
 *
 * These labels used to live inside Calendar.tsx, where only the staff-side
 * card could reach them. The client portal rendered the same report with far
 * less of it — a photo, one note and a return frequency — so everything the
 * groomer recorded about coat, skin, ears, nails and teeth was collected,
 * emailed on the printed card, and then invisible to the client who logged in
 * to look. Shared so both surfaces say the same thing.
 */

export const GROOM_RATING_LABELS: Record<string, string> = {
  pawfect: "Absolutely pawfect 🐾",
  great: "Great session",
  good: "Good",
  okay: "Okay",
  difficult: "Difficult",
};

export const GROOM_CONDITION_LABELS: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  matted: "Matted",
  irritated: "Irritated",
  flaky: "Flaky",
  bright_clear: "Bright & clear",
  mild_discharge: "Mild discharge",
  needs_vet: "Needs vet",
  clean: "Clean",
  mild_buildup: "Mild buildup",
  dirty: "Dirty",
  trimmed: "Trimmed",
  long: "Long",
  very_long: "Very long",
  broken: "Broken",
  mild_tartar: "Mild tartar",
  heavy_tartar: "Heavy tartar",
};

/** The conditions a groomer can record, in the order a client reads them. */
export type GroomConditions = {
  coatCondition?: string | null;
  skinCondition?: string | null;
  eyeCondition?: string | null;
  earCondition?: string | null;
  nailCondition?: string | null;
  teethCondition?: string | null;
};

/**
 * The "we checked" rows, skipping anything the groomer left blank.
 *
 * Blank is not the same as fine: a groomer who did not look at the teeth
 * should not produce a card implying the teeth were clean. So an unset
 * condition is dropped rather than defaulted.
 */
export function groomCardConditions(report: GroomConditions): { label: string; value: string }[] {
  const rows: [string, string | null | undefined][] = [
    ["Coat", report.coatCondition],
    ["Skin", report.skinCondition],
    ["Eyes", report.eyeCondition],
    ["Ears", report.earCondition],
    ["Nails", report.nailCondition],
    ["Teeth", report.teethCondition],
  ];
  return rows
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => ({ label, value: GROOM_CONDITION_LABELS[value] ?? value }));
}

/** Mood is stored as one comma-separated string; empty entries are dropped. */
export function groomCardMoods(mood: string | null | undefined): string[] {
  return String(mood ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** The headline rating, falling back to the raw value rather than hiding it. */
export function groomCardRating(rating: string | null | undefined): string | null {
  if (!rating) return null;
  return GROOM_RATING_LABELS[rating] ?? rating;
}
