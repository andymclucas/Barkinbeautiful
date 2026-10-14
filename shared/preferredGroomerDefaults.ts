/**
 * Filling in the groomer a booking opens on, from the dogs being booked.
 *
 * `pets.preferred_groomer_id` is the salon's "Char" in red marker on the
 * whiteboard, moved onto the dog's file. This turns it into the thing it
 * was always for: the booking already says who, so nobody has to remember.
 *
 * Three rules, all of them about not guessing:
 *
 *   1. **Never override a choice already made.** A groomer picked by hand,
 *      or a per-dog split already started, wins outright. This fills gaps.
 *   2. **Never book somebody who has left.** A preference outlives the
 *      person it names, and a stale id would silently assign a dog to a
 *      staff member who is no longer on the roster.
 *   3. **Never spread one dog's preference onto another dog.** The
 *      booking-wide groomer is only set when every selected dog agrees.
 *      One dog preferring Charlotte says nothing about the dog beside it,
 *      so that case becomes a per-dog split and the other dog is left for
 *      a human — which is the honest answer, not an inconvenience.
 */

export type PetGroomerPreference = {
  id: number;
  preferredGroomerId?: number | null;
};

export type BookingGroomerDraft = {
  /** Booking-wide groomer, as the dialog holds it: "" when unset. */
  staffId: string;
  /** Per-dog overrides, keyed by pet id as a string. */
  staffByPetId: Record<string, string>;
};

/**
 * What the draft should become, or null when it should be left alone.
 *
 * Returning null rather than an equal object matters: the caller runs this
 * from an effect, and handing back a fresh object every render would set
 * state forever.
 */
export function preferredGroomerDefaults(input: {
  petIds: ReadonlyArray<string>;
  draft: BookingGroomerDraft;
  pets: ReadonlyArray<PetGroomerPreference>;
  /** Staff who still work here. A preference naming anybody else is ignored. */
  rosterIds: ReadonlyArray<number>;
}): BookingGroomerDraft | null {
  const { petIds, draft, pets, rosterIds } = input;
  if (petIds.length === 0) return null;
  // Rule 1: a groomer already chosen for the booking settles it.
  if (draft.staffId.trim() !== "") return null;

  const roster = new Set(rosterIds);
  const byId = new Map(pets.map((pet) => [String(pet.id), pet]));

  const preferences = petIds.map((petId) => {
    const preferred = byId.get(petId)?.preferredGroomerId ?? null;
    // Rule 2: a preference naming somebody who has left is not a preference.
    return preferred !== null && roster.has(preferred) ? String(preferred) : null;
  });

  const known = preferences.filter((value): value is string => value !== null);
  if (known.length === 0) return null;

  // Rule 3: one groomer for the whole booking only when nothing disagrees —
  // every selected dog has a preference AND they are all the same one.
  const everyDogAgrees = known.length === petIds.length
    && known.every((value) => value === known[0]);
  if (everyDogAgrees) {
    // Already split by hand? Leave it; the split is the more specific choice.
    if (Object.keys(draft.staffByPetId).length > 0) return null;
    return { staffId: known[0], staffByPetId: draft.staffByPetId };
  }

  // Otherwise fill only the dogs that have a preference, and only where
  // nothing has been chosen for them yet.
  const next = { ...draft.staffByPetId };
  let changed = false;
  petIds.forEach((petId, index) => {
    const preferred = preferences[index];
    if (preferred === null) return;
    if ((next[petId] ?? "").trim() !== "") return;
    next[petId] = preferred;
    changed = true;
  });
  return changed ? { staffId: draft.staffId, staffByPetId: next } : null;
}
