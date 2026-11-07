import { dayInZone } from "./calendarDay";

/**
 * Whether a client has gone quiet long enough to be marked inactive.
 *
 * Andy, 07/11/2026: "Zero visits in 12 months is inactive."
 *
 * This is the rule behind the one-off pass in
 * scripts/mark-inactive-clients.ts. It is a pure function, separate from
 * the script, because it decides the status of several thousand real
 * client records and the previous value is recorded nowhere — so it had
 * better be testable without a database.
 *
 * ## It is not the same question as "lapsed"
 *
 * shared/lapsedClients.ts answers "who should I ring" and measures each
 * household against its OWN rhythm: a fortnightly bath and a ten-weekly
 * styled groom are both on time at completely different intervals. That
 * is the better question and it already has a screen.
 *
 * This answers something blunter and more administrative — "is this
 * still a client at all" — with one flat cutoff Andy chose. The two are
 * allowed to disagree: a client six weeks overdue on a six-week rhythm is
 * lapsed and worth ringing, and is nowhere near inactive.
 *
 * ## A visit means a COMPLETED appointment
 *
 * Same definition the lapsed report uses, deliberately, so the two cannot
 * drift: `workflowState = "complete"`. A cancellation is not a visit, and
 * nor is a booking that no-showed.
 *
 * ## Four things stop a client being marked, and each has bitten something
 *
 * - **A future booking.** Somebody whose last groom was thirteen months
 *   ago but who is in the diary for Thursday is plainly a client. Counted
 *   the same way the lapsed report counts it: anything ahead of now that
 *   is not cancelled or no-show.
 * - **A live membership.** They are paying weekly. Marking a paying member
 *   inactive would be the worst single outcome of this pass, and a
 *   membership that is merely `paused` is still a member — only cancelled
 *   and expired are not.
 * - **Being new.** A client added two months ago who has not had their
 *   first groom yet has "zero visits in 12 months" on a literal reading.
 *   They are not inactive, they are new. Anyone created inside the window
 *   is left alone.
 * - **Already having a status somebody chose.** `blocked` is a decision a
 *   person made; overwriting it with `inactive` would throw that away and
 *   it is not recoverable. Only `active` rows are touched.
 */

/** Andy's cutoff, 07/11/2026. */
export const INACTIVE_AFTER_MONTHS = 12;

export type InactiveSkipReason =
  | "not_active_status"
  | "has_future_booking"
  | "has_live_membership"
  | "created_inside_window"
  | "visited_inside_window";

export type InactiveDecision =
  | { markInactive: true; lastVisitDay: string | null }
  | { markInactive: false; reason: InactiveSkipReason };

export const INACTIVE_SKIP_LABEL: Record<InactiveSkipReason, string> = {
  not_active_status: "status was already set by hand",
  has_future_booking: "has a booking in the diary",
  has_live_membership: "has a live membership",
  created_inside_window: "added too recently to judge",
  visited_inside_window: "visited inside the window",
};

/** Membership statuses that mean "still a member". */
export const LIVE_MEMBERSHIP_STATUSES = ["active", "paused", "pending_payment"] as const;

/**
 * The first day that still counts as a recent visit.
 *
 * Computed in the salon's zone, not the host's. `CURDATE()` is UTC here
 * and a query run before 10am Brisbane reads the previous day, which has
 * already faked 31 missing dogs once on 06/11/2026. A one-day error at
 * the edge of a twelve-month window is small, but it is free to avoid.
 */
export function inactiveCutoffDay(now: Date, timeZone: string): string | null {
  const today = dayInZone(now, timeZone);
  if (!today) return null;
  const [y, m, d] = today.split("-").map(Number);
  // Date arithmetic on the calendar day itself, so the answer does not
  // depend on the time of day the pass happens to run.
  const shifted = new Date(Date.UTC(y, m - 1 - INACTIVE_AFTER_MONTHS, d));
  return dayInZone(shifted, "UTC");
}

export function decideInactive(input: {
  status: string;
  /** Day of their most recent COMPLETED appointment, or null for never. */
  lastVisitDay: string | null;
  hasFutureBooking: boolean;
  hasLiveMembership: boolean;
  /** When the client record was created, in the salon's zone. */
  createdDay: string | null;
  cutoffDay: string;
}): InactiveDecision {
  // Ordered so the most important refusals come first and a client can
  // only ever be marked for one reason: there is nothing to say.
  if (input.status !== "active") return { markInactive: false, reason: "not_active_status" };
  if (input.hasLiveMembership) return { markInactive: false, reason: "has_live_membership" };
  if (input.hasFutureBooking) return { markInactive: false, reason: "has_future_booking" };
  // A client created inside the window has not had twelve months in which
  // to visit, so the rule cannot say anything about them yet.
  if (input.createdDay && input.createdDay >= input.cutoffDay) {
    return { markInactive: false, reason: "created_inside_window" };
  }
  if (input.lastVisitDay && input.lastVisitDay >= input.cutoffDay) {
    return { markInactive: false, reason: "visited_inside_window" };
  }
  return { markInactive: true, lastVisitDay: input.lastVisitDay };
}
