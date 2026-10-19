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
 * The dogs in this selection that cannot be booked.
 *
 * Returned rather than thrown so the caller can name them. "Tyson has
 * been recorded as passed away" is an explanation; "the selected pets
 * are not available" is the sort of message that makes somebody think
 * the system is broken and try again.
 */
export function departedPetsIn(pets: BookablePet[]): BookablePet[] {
  return pets.filter(petHasPassedAway);
}

export function departedBookingMessage(pets: BookablePet[]): string | null {
  const gone = departedPetsIn(pets);
  if (gone.length === 0) return null;
  const names = gone.map((p) => p.name?.trim()).filter(Boolean) as string[];
  if (names.length === 0) {
    return gone.length === 1
      ? "That dog has been recorded as passed away and cannot be booked."
      : "Those dogs have been recorded as passed away and cannot be booked.";
  }
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? "has" : "have"} been recorded as passed away and cannot be booked.`;
}
