/**
 * One status for every dog on a family booking.
 *
 * Lauren, 24/11/2026, with a screenshot of Zeky and Genji's booking: "why
 * does it say only one dogs name in status". The status box changed the
 * dog the dialog was opened on and named only that one. Andy, the same
 * day: "Status should name both dogs and set them together."
 */

type DogOnBooking = { id: number; petName?: string | null; workflowState: string };

/** "Zeky & Genji", "Zeky, Genji & Bella". */
export function familyStatusLabel(dogs: readonly DogOnBooking[]): string {
  const names = dogs.map((d) => d.petName?.trim()).filter((n): n is string => Boolean(n));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** The bookings a new status has to be written to: every dog not already in it. */
export function familyStatusChanges(dogs: readonly DogOnBooking[], newState: string): number[] {
  return dogs.filter((d) => d.workflowState !== newState).map((d) => d.id);
}

/** True when the dogs on the booking are not all at the same stage. */
export function familyStatusesDiffer(dogs: readonly DogOnBooking[]): boolean {
  return new Set(dogs.map((d) => d.workflowState)).size > 1;
}
