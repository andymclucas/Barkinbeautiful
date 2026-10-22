/**
 * Whether a dog can be deleted outright, and what to say when not.
 *
 * Andy, 23/10/2026: "Also need a button to add, edit or delete a dog."
 *
 * Delete is the one of the three that needs a rule. Until now the only
 * way to retire a pet was `status: departed`, so staff marked DUPLICATES
 * as dead — five of seven "departed" dogs on 19/10/2026 were duplicates,
 * not deaths. That is the gap this fills, and it is also the limit: a
 * delete is for a row that should never have existed, not for a dog that
 * has been here.
 *
 * So a dog with history is never deleted. Removing it would orphan
 * appointments, invoices and timing analytics, and "Record passing" is
 * the right action for a dog that has lived — it keeps the history and
 * stops the bookings.
 */

export type PetHistory = {
  appointments: number;
  memberships: number;
  photos: number;
  styleNotes: number;
};

export type DeletionVerdict =
  | { canDelete: true }
  | { canDelete: false; reason: string; suggestPassing: boolean };

/** Human counts, for a sentence rather than a list of zeroes. */
function listBlockers(history: PetHistory): string[] {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(history.appointments, "booking", "bookings");
  add(history.memberships, "membership", "memberships");
  add(history.photos, "photo", "photos");
  add(history.styleNotes, "grooming note", "grooming notes");
  return parts;
}

export function canDeletePet(history: PetHistory): DeletionVerdict {
  const blockers = listBlockers(history);
  if (blockers.length === 0) return { canDelete: true };

  const joined = blockers.length === 1
    ? blockers[0]
    : `${blockers.slice(0, -1).join(", ")} and ${blockers[blockers.length - 1]}`;

  // A dog with bookings has been in the salon, so passing is the action
  // that fits. One with only a stray photo has not, and saying "record a
  // passing" about a duplicate row would be grim as well as wrong.
  const suggestPassing = history.appointments > 0;
  return {
    canDelete: false,
    reason: `This dog has ${joined} on file, so deleting would lose that history.`
      + (suggestPassing ? " Use Record passing instead if they have died." : ""),
    suggestPassing,
  };
}
