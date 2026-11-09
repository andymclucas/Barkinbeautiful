import { isDeadAppointment, type SummarisableAppointment } from "./calendarSummary";

/**
 * One dog, one booking, one day.
 *
 * Tanya Leek, 14/01/2027. Bonnie and Chester were booked at 12:30 on
 * 6 November and booked AGAIN at 11:30 on 8 November, by somebody who
 * meant to move the first booking. Both confirmations went out, both
 * bookings stayed on the board, and she said yes to both — so two
 * groomers each had a dog that was also promised to somebody else.
 *
 * `rebook` and `addRecurrenceToAppointment` each carried this guard,
 * written after a dog was duplicated onto a live board twice on
 * 29/09/2026. The other eight booking paths did not, including
 * `createMultiPetAppointment`, which is the one the salon actually
 * books through and the one that made the Leek pair.
 *
 * Pure, so the rule can be tested without a database — the suite is
 * hermetic and this is exactly the sort of thing that must not wait for
 * a real board to prove itself.
 */
export type SameDayBooking = SummarisableAppointment & {
  petId: number;
  petName?: string | null;
};

export type DuplicateBookingClash = {
  petId: number;
  petName: string | null;
};

/**
 * Which of `petIds` already have a live booking among `sameDayBookings`.
 *
 * Cancelled and no-show rows do not count. The two guards that existed
 * disagreed on this — `rebook` counted every row "whatever state it is
 * in", so a client who cancelled in the morning could not be rebooked
 * that afternoon and was told to "pick another date" while the dog's
 * diary was in fact empty. A dog that is not coming is not booked, which
 * is the same `isDeadAppointment` rule the calendar draws by.
 */
export function dogsAlreadyBookedThatDay(
  petIds: number[],
  sameDayBookings: SameDayBooking[],
): DuplicateBookingClash[] {
  const wanted = new Set(petIds);
  const seen = new Set<number>();
  const clashes: DuplicateBookingClash[] = [];
  for (const booking of sameDayBookings) {
    if (!wanted.has(booking.petId)) continue;
    if (isDeadAppointment(booking)) continue;
    if (seen.has(booking.petId)) continue;
    seen.add(booking.petId);
    clashes.push({ petId: booking.petId, petName: booking.petName?.trim() || null });
  }
  return clashes;
}

/**
 * What to tell whoever is booking. Names the dogs, because "one of these
 * dogs is already booked" sent staff to check all four of a family's
 * diaries by hand.
 */
export function duplicateBookingMessage(clashes: DuplicateBookingClash[]): string {
  if (clashes.length === 0) return "";
  const named = clashes.map((clash) => clash.petName).filter((name): name is string => Boolean(name));
  if (named.length === 0) {
    return clashes.length === 1
      ? "That dog is already booked in that day — pick another date, or move the booking that exists"
      : "Those dogs are already booked in that day — pick another date, or move the booking that exists";
  }
  const list = named.length === 1
    ? named[0]
    : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  const verb = named.length === 1 ? "is" : "are";
  return `${list} ${verb} already booked in that day — pick another date, or move the booking that exists`;
}
