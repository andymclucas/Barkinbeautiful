/**
 * Several dogs on one waitlist entry.
 *
 * Andy, 11/11/2026, with a household's waitlist form open: "Only one dog
 * able to be added to the waitlist." Two dogs who come together wait for
 * ONE slot: they are offered it together, in one text, and approving the
 * claim books both into it. So they are one entry, not two entries that
 * would each be offered separately and could be split across days.
 *
 * The first dog stays in `pet_id`, which every existing query reads; the
 * rest are `extra_pet_ids`. An entry made before this has no extras and
 * behaves exactly as it did.
 */

export const MAX_DOGS_PER_WAITLIST_ENTRY = 6;

/** Every dog on an entry, first dog first, no repeats. */
export function entryPetIds(petId: number, extraPetIds: unknown): number[] {
  const extras = Array.isArray(extraPetIds) ? extraPetIds : parseMaybeJson(extraPetIds);
  const ids = [petId, ...extras.map(Number)].filter((n) => Number.isInteger(n) && n > 0);
  return Array.from(new Set(ids));
}

function parseMaybeJson(value: unknown): unknown[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** What to store: the first dog, and the rest (or null for one dog). */
export function splitEntryPets(petIds: readonly number[]): { petId: number; extraPetIds: number[] | null } {
  const unique = Array.from(new Set(petIds.filter((n) => Number.isInteger(n) && n > 0)));
  if (unique.length === 0) throw new Error("Choose at least one dog.");
  const [first, ...rest] = unique;
  return { petId: first, extraPetIds: rest.length > 0 ? rest : null };
}

/** "Zoey", "Zoey & Max", "Zoey, Max & Bella" — the way the salon writes it. */
export function joinDogNames(names: readonly string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} & ${clean[clean.length - 1]}`;
}
