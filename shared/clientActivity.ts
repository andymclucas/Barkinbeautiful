import { dayInZone } from "./calendarDay";

/**
 * Whether a client has gone quiet long enough to be marked inactive.
 *
 * Andy, 07/11/2026: "Zero visits in 12 months is inactive."
 *
 * ## The first version of this was wrong twice, and the dry run caught it
 *
 * Worth recording, because both mistakes look reasonable in the code and
 * are only visible against the real data.
 *
 * **A visit is not `workflow_state = "complete"` here.** That is what
 * shared/lapsedClients.ts uses, so copying it looked like consistency.
 * But 7,189 appointments sit in `scheduled` with dates in the PAST,
 * back to July 2024 — imported MoeGo history that the workflow never
 * walked, because nobody checked those dogs in through Groomigo. They
 * are real grooms. Counting only `complete` rows read 8,946 of 10,114
 * clients as having never been in.
 *
 * So a visit is **an appointment in the past that was not cancelled or
 * no-showed**. That captures the completed ones and the imported ones
 * together, which is the only definition this data supports.
 *
 * **`clients.created_at` is not when somebody became a client.** It is
 * 3 August 2026 for 10,075 of 10,114 rows — the day the MoeGo merge ran.
 * The first version skipped anyone created inside the window, reasoning
 * that a new client has not had twelve months in which to visit. Against
 * this data that skipped 9,150 clients and the pass marked nobody at
 * all. shared/clientSince.ts had already worked this out and says so.
 *
 * The two errors cancelled into a harmless "0 to mark", which is luck
 * rather than correctness: fixing only the second would have marked
 * thousands of clients who have been coming for years.
 *
 * ## It is not the same question as "lapsed"
 *
 * shared/lapsedClients.ts answers "who should I ring" and measures each
 * household against its OWN rhythm. A client six weeks overdue on a
 * six-week cycle is lapsed and nowhere near inactive. This answers the
 * blunter "is this still a client at all", on one flat cutoff.
 *
 * ## Never been in at all is a separate question, and a big one
 *
 * 8,319 clients have no past appointment in Groomigo whatsoever. That
 * does NOT mean they never came: imported history only reaches July
 * 2024, so anyone whose last groom was before that reads the same as
 * somebody who enquired once and never booked. Marking 8,319 people on
 * absent data is a different act from marking the 772 who demonstrably
 * came and then stopped, so it is OFF unless explicitly asked for.
 */

/** Andy's cutoff, 07/11/2026. */
export const INACTIVE_AFTER_MONTHS = 12;

export type InactiveSkipReason =
  | "not_active_status"
  | "has_future_booking"
  | "has_live_membership"
  | "never_visited"
  | "visited_inside_window";

export type InactiveDecision =
  | { markInactive: true; lastVisitDay: string | null }
  | { markInactive: false; reason: InactiveSkipReason };

export const INACTIVE_SKIP_LABEL: Record<InactiveSkipReason, string> = {
  not_active_status: "status was already set by hand or by the import",
  has_future_booking: "has a booking in the diary",
  has_live_membership: "has a live membership",
  never_visited: "never been in at all (not counted unless asked for)",
  visited_inside_window: "visited inside the window",
};

/** Membership statuses that mean "still a member". */
export const LIVE_MEMBERSHIP_STATUSES = ["active", "paused", "pending_payment"] as const;

/**
 * Workflow states that mean a booking did NOT happen.
 *
 * Everything else in the past counts as a visit, including `scheduled` —
 * see the note above on the 7,189 imported rows.
 */
export const NON_VISIT_STATES = ["cancelled", "no_show"] as const;

/**
 * The first day that still counts as a recent visit.
 *
 * Computed in the salon's zone, not the host's. `CURDATE()` is UTC here
 * and a query run before 10am Brisbane reads the previous day, which has
 * already faked 31 missing dogs once on 06/11/2026.
 */
export function inactiveCutoffDay(now: Date, timeZone: string): string | null {
  const today = dayInZone(now, timeZone);
  if (!today) return null;
  const [y, m, d] = today.split("-").map(Number);
  // Arithmetic on the calendar day itself, so the answer does not depend
  // on the time of day the pass happens to run.
  const shifted = new Date(Date.UTC(y, m - 1 - INACTIVE_AFTER_MONTHS, d));
  return dayInZone(shifted, "UTC");
}

export function decideInactive(input: {
  status: string;
  /**
   * Day of their most recent PAST appointment that was not cancelled or
   * no-showed, or null if Groomigo has no record of them ever coming in.
   */
  lastVisitDay: string | null;
  hasFutureBooking: boolean;
  hasLiveMembership: boolean;
  cutoffDay: string;
  /**
   * Whether to also mark the clients with no visit on record at all.
   * Off by default: that cohort is 8,319 people and the data cannot tell
   * "left before July 2024" from "never booked".
   */
  includeNeverVisited?: boolean;
}): InactiveDecision {
  // Ordered so a client can only ever be refused for one reason, and the
  // most important refusal wins — the dry run's counts then add up to
  // the number of clients considered.
  if (input.status !== "active") return { markInactive: false, reason: "not_active_status" };
  if (input.hasLiveMembership) return { markInactive: false, reason: "has_live_membership" };
  if (input.hasFutureBooking) return { markInactive: false, reason: "has_future_booking" };
  if (!input.lastVisitDay) {
    return input.includeNeverVisited
      ? { markInactive: true, lastVisitDay: null }
      : { markInactive: false, reason: "never_visited" };
  }
  // Inclusive on the boundary: a visit ON the cutoff day is inside the
  // window. Off by one here marks somebody on the strength of a groom
  // they actually had.
  if (input.lastVisitDay >= input.cutoffDay) {
    return { markInactive: false, reason: "visited_inside_window" };
  }
  return { markInactive: true, lastVisitDay: input.lastVisitDay };
}
