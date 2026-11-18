/**
 * What the calendar asks before deleting a booking that has more than
 * one dog on it.
 *
 * Lauren, 18/11/2026, with two dogs from one household in the salon: "I
 * tried to delete 1 of the dogs to then add to the other combined file
 * to have a joining invoice... it deleted both bookings then... don't
 * know why." Delete on the calendar always removed every dog on the
 * booking. It said so, in one sentence inside a longer one, and offered
 * a single red Delete button — so the only way to take one dog off was
 * the client's Bookings tab, which nobody would guess.
 *
 * The server could always delete one dog (`onlyThisDog`). This is the
 * question that lets staff ask for it: two buttons that say exactly what
 * each one removes, and neither is the default.
 */
export type DeleteBookingPrompt =
  | { shared: false }
  | {
      shared: true;
      /** Everything said before the buttons. */
      question: string;
      /** Removes the one dog the dialog was opened on. */
      onlyLabel: string;
      /** Removes every dog on the booking. */
      allLabel: string;
    };

const list = (names: readonly string[]) =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function deleteBookingPrompt(input: {
  petName: string | null | undefined;
  /** The other dogs on the same booking. */
  otherDogs: readonly (string | null | undefined)[];
}): DeleteBookingPrompt {
  const others = input.otherDogs.map((name) => (name ?? "").trim()).filter(Boolean);
  // Dogs with no name still count: the booking is shared whether or not
  // every row can be named.
  const otherCount = input.otherDogs.length;
  if (otherCount === 0) return { shared: false };

  const pet = (input.petName ?? "").trim() || "this dog";
  const total = otherCount + 1;
  const withWhom = others.length === otherCount ? list(others) : `${otherCount} other dog${otherCount === 1 ? "" : "s"}`;
  return {
    shared: true,
    question: `${pet} is on one booking with ${withWhom}. Delete only ${pet}, or all ${total} dogs?`,
    onlyLabel: `Delete only ${pet}`,
    allLabel: `Delete all ${total} dogs`,
  };
}
