/**
 * Cancelling every upcoming booking a client has, in one go.
 *
 * Lauren, 21/11/2026, of a client with five bookings ahead: "Is there a
 * quick way to delete all these bookings? She's moving. She may come to
 * visit later in time." Andy: "Add the function to cancel all."
 *
 * CANCEL, not delete: the bookings stay on the client's file under
 * Cancelled, so the history says what happened and any of them can be
 * put back. Deleting would leave nothing to show she was ever booked.
 *
 * What counts as upcoming is exactly the client page's Upcoming tab
 * (shared/bookingBuckets.ts), so the button cancels the rows the person
 * pressing it is looking at, and nothing else. A dog already checked in,
 * or partway through its groom, is in the salon: that is never cancelled
 * in bulk (the same rule as cancelling a whole booking), and it is
 * named back rather than skipped silently.
 *
 * No text goes to the client. Each cancellation on its own texts the
 * client; here that would be one text per booking, and the client is
 * the one who asked. Anyone who wants her told can message her.
 */
import { bookingBucket, type BucketableBooking } from "./bookingBuckets";

export type CancelAllRow = BucketableBooking & {
  id: number;
  petName?: string | null;
};

export type CancelAllPlan = {
  /** Upcoming and not yet started: these are cancelled. */
  cancel: number[];
  /** Upcoming but the dog is already in the salon: left alone. */
  inSalon: { id: number; petName: string }[];
};

/** Workflow states that mean the dog is not in the building yet. */
const NOT_STARTED = new Set(["", "scheduled"]);

export function planCancelAllUpcoming(rows: readonly CancelAllRow[], now: Date = new Date()): CancelAllPlan {
  const plan: CancelAllPlan = { cancel: [], inSalon: [] };
  for (const row of rows) {
    if (bookingBucket(row, now) !== "upcoming") continue;
    if (NOT_STARTED.has(String(row.workflowState ?? ""))) plan.cancel.push(row.id);
    else plan.inSalon.push({ id: row.id, petName: row.petName?.trim() || "A dog" });
  }
  return plan;
}

/** What the confirm button says before anything happens. */
export function describeCancelAll(count: number): string {
  if (count === 0) return "There are no upcoming bookings to cancel.";
  const bookings = count === 1 ? "1 upcoming booking" : `${count} upcoming bookings`;
  return `This cancels ${bookings}. They move to the Cancelled tab, where any of them can be put back. No text is sent to the client.`;
}

/** What staff are told afterwards. */
export function describeCancelAllResult(cancelled: number, inSalon: readonly string[]): string {
  const done = cancelled === 1 ? "1 booking cancelled." : `${cancelled} bookings cancelled.`;
  if (inSalon.length === 0) return `${done} No text was sent to the client.`;
  const names = inSalon.length === 1 ? inSalon[0] : `${inSalon.slice(0, -1).join(", ")} and ${inSalon[inSalon.length - 1]}`;
  return `${done} ${names} left alone, already at the salon. No text was sent to the client.`;
}
