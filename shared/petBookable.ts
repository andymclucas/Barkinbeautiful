/**
 * A dog that has passed away cannot be booked in.
 *
 * It stays visible everywhere it already appeared — the family's dog
 * list, the booking dialog, past appointments — because removing it is
 * its own kind of wrong: staff look for the dog they remember, and a
 * gap reads as a mistake rather than as a death. pets.status goes to
 * "departed" and the record stays.
 *
 * What must not happen is a booking. On 19/10/2026 the New Appointment
 * dialog had Tyson selected and priced at $145, five days after he was
 * recorded as passed away. There was nothing in the dialog to stop it
 * and nothing on the server either.
 */

export type BookablePet = {
  id: number;
  name?: string | null;
  status?: string | null;
};

export function petHasPassedAway(pet: Pick<BookablePet, "status">): boolean {
  return pet.status === "departed";
}

/** What the booking form says when somebody taps a memorial dog. */
export const PET_CANNOT_BE_SELECTED = "This pet cannot be selected";

/**
 * An ARCHIVED dog cannot be booked either (shared/petArchive.ts). It is
 * hidden from the booking lists, so reaching this means a stale form or a
 * direct call — and the answer is different from a death, so it says so.
 */
export function petIsArchived(pet: Pick<BookablePet, "status">): boolean {
  return pet.status === "archived";
}

/**
 * The dogs in this selection that cannot be booked: passed away, or
 * archived since 10/11/2026. The name is older than archiving; the eleven
 * booking paths that call departedBookingMessage are pinned by
 * server/departedBookingCoverage.test.ts, so widening the rule here covers
 * them all at once.
 *
 * Returned rather than thrown so the caller can name them. "Tyson has
 * been recorded as passed away" is an explanation; "the selected pets
 * are not available" is the sort of message that makes somebody think
 * the system is broken and try again.
 */
export function departedPetsIn(pets: BookablePet[]): BookablePet[] {
  return pets.filter((pet) => petHasPassedAway(pet) || petIsArchived(pet));
}

function joinNames(names: string[]): string {
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function sentence(group: BookablePet[], unnamedOne: string, unnamedMany: string, named: (list: string, plural: boolean) => string): string | null {
  if (group.length === 0) return null;
  const names = group.map((p) => p.name?.trim()).filter(Boolean) as string[];
  if (names.length === 0) return group.length === 1 ? unnamedOne : unnamedMany;
  return named(joinNames(names), names.length > 1);
}

export function departedBookingMessage(pets: BookablePet[]): string | null {
  const passed = sentence(
    pets.filter(petHasPassedAway),
    "That dog has been recorded as passed away and cannot be booked.",
    "Those dogs have been recorded as passed away and cannot be booked.",
    (list, plural) => `${list} ${plural ? "have" : "has"} been recorded as passed away and cannot be booked.`,
  );
  const archived = sentence(
    pets.filter(petIsArchived),
    "That dog is archived and cannot be booked. Restore it from the client page first.",
    "Those dogs are archived and cannot be booked. Restore them from the client page first.",
    (list, plural) => `${list} ${plural ? "are" : "is"} archived and cannot be booked. Restore ${plural ? "them" : "it"} from the client page first.`,
  );
  const parts = [passed, archived].filter(Boolean);
  return parts.length === 0 ? null : parts.join(" ");
}
