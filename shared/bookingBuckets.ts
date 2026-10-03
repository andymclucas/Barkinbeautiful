/**
 * Which pile a booking belongs in on the client record.
 *
 * Four piles, where MoeGo has five. There is deliberately no "pending":
 * MoeGo means unconfirmed by it, and Groomigo has no reliable flag for
 * that — `status` reads "pending" on 1,023 of the 1,025 future bookings
 * and "confirmed" on almost everything in the past, so it marks roughly
 * which import a row came from rather than whether anyone confirmed it.
 * A Pending tab built on it would hold every upcoming booking and leave
 * Upcoming with two. Better to leave it out than to show a number that
 * means nothing.
 *
 * Every booking belongs to exactly one pile. Written as a pure function so the counts on the tabs
 * and the rows underneath them cannot disagree: they are the same call.
 *
 * Order matters. A cancelled booking in the future is cancelled, not
 * upcoming; a no-show is a no-show whatever its workflow says. Deciding
 * the terminal states first is what keeps the piles disjoint.
 */

export const BOOKING_BUCKETS = ["upcoming", "history", "cancelled", "no_show"] as const;
export type BookingBucket = (typeof BOOKING_BUCKETS)[number];

export const BOOKING_BUCKET_LABELS: Record<BookingBucket, string> = {
  upcoming: "Upcoming",
  history: "History",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export type BucketableBooking = {
  scheduledStart: string | Date;
  status?: string | null;
  workflowState?: string | null;
};

export function bookingBucket(booking: BucketableBooking, now: Date = new Date()): BookingBucket {
  const status = booking.status ?? "";
  const workflow = booking.workflowState ?? "";

  if (status === "cancelled" || workflow === "cancelled") return "cancelled";
  if (status === "no_show" || workflow === "no_show") return "no_show";

  // Finished is history even if the clock says the slot has not ended —
  // a dog collected early is done, not still upcoming.
  if (workflow === "complete") return "history";

  const start = booking.scheduledStart instanceof Date
    ? booking.scheduledStart
    : new Date(booking.scheduledStart);
  // An unreadable date is shown rather than silently dropped from every
  // pile, which is what returning nothing would do.
  if (Number.isNaN(start.getTime())) return "history";

  if (start.getTime() > now.getTime()) return "upcoming";

  // Everything else in the past is history.
  //
  // Not "past and never marked complete is pending", which was the first
  // attempt: ten of Holly's twenty past grooms came over from MoeGo as
  // confirmed/scheduled because the import never advanced the workflow,
  // and that rule filed two years of finished, paid grooms as awaiting
  // action. `status` is the salon's own word for unconfirmed and is
  // already decided above.
  return "history";
}

export function countBookingBuckets(
  bookings: BucketableBooking[],
  now: Date = new Date(),
): Record<BookingBucket, number> {
  const counts = { upcoming: 0, history: 0, cancelled: 0, no_show: 0 };
  for (const booking of bookings) counts[bookingBucket(booking, now)]++;
  return counts;
}
