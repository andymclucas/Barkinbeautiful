/**
 * Which groomer each dog in a booking is assigned to.
 *
 * A two-dog family is one booking but two appointment rows, and the salon
 * routinely splits them: Lola with Lauren, Poppy with Megs. The rows have
 * carried their own staffId since the beginning — only the booking form
 * insisted on one groomer for the lot, so the split had to be made afterwards
 * by editing each appointment.
 *
 * Pure so the fallback rules can be tested without a database, which matters
 * because the quiet failure here is a dog silently assigned to nobody.
 */

/** Keyed by pet id as a string, because that is what JSON gives us. */
export type StaffByPetId = Record<string, number> | undefined | null;

/**
 * Resolves one groomer per pet.
 *
 * A pet not named in the map falls back to the booking's single groomer, so
 * the common case — everyone with the same person — needs no map at all.
 * `undefined` is a real answer: an unassigned appointment is valid here and
 * the board shows it as needing a groomer.
 */
export function resolveGroomerAssignments(
  petIds: number[],
  defaultStaffId: number | undefined,
  staffByPetId: StaffByPetId,
): Map<number, number | undefined> {
  const assignments = new Map<number, number | undefined>();
  for (const petId of petIds) {
    const specific = staffByPetId?.[String(petId)];
    assignments.set(petId, typeof specific === "number" ? specific : defaultStaffId);
  }
  return assignments;
}

/**
 * Every staff id the booking refers to, for one tenant check before writing.
 *
 * Without this a caller could post any staff id at all and have a dog filed
 * under another salon's groomer; the single-groomer path never validated it
 * either, so this closes both.
 */
export function referencedStaffIds(
  petIds: number[],
  defaultStaffId: number | undefined,
  staffByPetId: StaffByPetId,
): number[] {
  const ids = new Set<number>();
  if (typeof defaultStaffId === "number") ids.add(defaultStaffId);
  for (const petId of petIds) {
    const specific = staffByPetId?.[String(petId)];
    if (typeof specific === "number") ids.add(specific);
  }
  return Array.from(ids);
}

/**
 * Whether the booking actually splits the dogs between people.
 *
 * Used to decide whether to say so in the UI; a booking where everyone shares
 * a groomer should not grow a per-dog list it does not need.
 */
export function isSplitBooking(
  petIds: number[],
  defaultStaffId: number | undefined,
  staffByPetId: StaffByPetId,
): boolean {
  // Array.from, not spread: tsconfig targets below es2015 downlevel iteration.
  const assigned = Array.from(resolveGroomerAssignments(petIds, defaultStaffId, staffByPetId).values());
  return new Set(assigned.map((id) => id ?? 0)).size > 1;
}
