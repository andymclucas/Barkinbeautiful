/**
 * Which bookings come off the diary when a dog's passing is recorded.
 *
 * Lauren, 13/11/2026: she recorded a passing and the dog's three future
 * bookings stayed on the calendar, still holding a groomer's time and
 * still due a reminder.
 *
 * Unlike the membership questions in `petPassingReview.ts`, there is
 * nothing to decide here: a dog that has died is not coming. So these
 * are cancelled as part of recording the passing rather than proposed.
 *
 * The rule is deliberately narrow:
 *
 * - **Only `scheduled`.** A dog past that state was at the salon; that
 *   visit is history, not a future booking.
 * - **Only from the start of today.** Thousands of imported visits sit
 *   at `scheduled` in the past because nobody ever checked them in.
 *   Those are history too, and cancelling them would rewrite it.
 *   "From the start of today" rather than "from now" so a booking for
 *   this morning, recorded at lunchtime, still comes off the board.
 *
 * No text goes to the client. The ordinary cancel path sends a
 * cancellation notice; a grieving owner must not get one.
 */

export type PassingBookingCandidate = {
  id: number;
  workflowState: string;
  scheduledStart: Date;
};

export function bookingsCancelledByPassing<T extends PassingBookingCandidate>(
  bookings: T[],
  startOfToday: Date,
): T[] {
  return bookings.filter(
    (b) => b.workflowState === "scheduled" && b.scheduledStart.getTime() >= startOfToday.getTime(),
  );
}

/** "1 future booking" / "3 future bookings", for the confirmation toast. */
export function describeCancelledBookings(count: number): string {
  return `${count} future booking${count === 1 ? "" : "s"}`;
}
