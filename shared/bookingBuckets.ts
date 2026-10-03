/**
 * Which pile a booking belongs in on the client record.
 *
 * The salon reads its bookings the way MoeGo lays them out — pending,
 * upcoming, history, cancelled, no-show — and every booking belongs to
 * exactly one pile. Written as a pure function so the counts on the tabs
 * and the rows underneath them cannot disagree: they are the same call.
 *
 * Order matters. A cancelled booking in the future is cancelled, not
 * upcoming; a no-show is a no-show whatever its workflow says. Deciding
 * the terminal states first is what keeps the piles disjoint.
 */

export const BOOKING_BUCKETS = ["pending", "upcoming", "history", "cancelled", "no_show"] as const;
export type BookingBucket = (typeof BOOKING_BUCKETS)[number];

export const BOOKING_BUCKET_LABELS: Record<BookingBucket, string> = {
  pending: "Pending",
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
  if (Number.isNaN(start.getTime())) return "pending";

  if (start.getTime() > now.getTime()) {
    // "Pending" is the salon's own word for a booking nobody has
    // confirmed yet, not a synonym for upcoming.
    return status === "pending" ? "pending" : "upcoming";
  }

  // In the past and never finished: it needs someone to say what
  // happened, so it sits in pending rather than quietly joining history.
  return workflow === "scheduled" || workflow === "" ? "pending" : "history";
}

export function countBookingBuckets(
  bookings: BucketableBooking[],
  now: Date = new Date(),
): Record<BookingBucket, number> {
  const counts = { pending: 0, upcoming: 0, history: 0, cancelled: 0, no_show: 0 };
  for (const booking of bookings) counts[bookingBucket(booking, now)]++;
  return counts;
}
