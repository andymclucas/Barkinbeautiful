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
 * ## Never been in at all: the caution here was right, and irrelevant
 *
 * This note used to say that the ~8,300 clients with no past appointment
 * were too risky to mark, because imported history only reaches July
 * 2024 and so "left before the import starts" reads exactly like "never
 * booked". That is true, and it does not matter.
 *
 * Checked against the data on 09/11/2026: the earliest appointment in
 * Groomigo is **2024-07-21**, and the twelve-month cutoff is
 * **2025-11-09**. A client with no visit on record either never booked,
 * or last came before July 2024 — which is twenty-eight months ago.
 * Both readings land on the same side of the line. The distinction only
 * starts to matter for a cutoff shorter than about sixteen months.
 *
 * So the cohort is included, and `includeNeverVisited` survives only so
 * a caller can ask the narrower question deliberately. Andy, 09/11/2026,
 * looking at a Clients list of 9,695 where most rows read "0 bookings":
 * "A lot of these clients have zero appts, yet the client is still
 * showing as active. The rule should be in place that if zero appts in
 * the last 12 months (or any upcoming), the client goes into Inactive
 * status."
 *
 * What it costs: `massTextRecipients` and the campaign audiences all
 * filter on `status = 'active'`, so an inactive client is out of every
 * marketing send. For 8,683 people who have not been in for over a year
 * that is arguably right, but it is a real consequence and not a
 * cosmetic one — a win-back campaign has to go through the Reporting
 * page's lapsed list, which measures a different thing and does not read
 * this column.
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
  never_visited: "never been in at all (only when asked for narrowly)",
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
   * Whether a client with no visit on record counts as inactive.
   *
   * ON by default since 09/11/2026 — see the note at the top. Both
   * readings of an empty history are more than twelve months old, so
   * excluding them answered a narrower question than the one asked.
   * Pass false to ask only about clients who demonstrably came and then
   * stopped.
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
    return input.includeNeverVisited === false
      ? { markInactive: false, reason: "never_visited" }
      : { markInactive: true, lastVisitDay: null };
  }
  // Inclusive on the boundary: a visit ON the cutoff day is inside the
  // window. Off by one here marks somebody on the strength of a groom
  // they actually had.
  if (input.lastVisitDay >= input.cutoffDay) {
    return { markInactive: false, reason: "visited_inside_window" };
  }
  return { markInactive: true, lastVisitDay: input.lastVisitDay };
}

/**
 * The other direction: when does an inactive client become active again?
 *
 * Andy, 09/11/2026: "The rule should be in place." A rule that only ever
 * moves people one way is not a rule, it is a one-off tidy-up that
 * starts going stale the next morning — the first inactive client
 * somebody books in would stay inactive for ever, drop out of every
 * mass text, and sit in a filter nobody looks at while their dog is on
 * the board.
 *
 * ## A future booking, and nothing else
 *
 * Specifically NOT "the rule for inactive, inverted". Inverting it would
 * reactivate anyone whose last visit is inside twelve months — and that
 * would undo a status a person set BY HAND. Staff who know a client has
 * moved to Melbourne mark them inactive today, while their last groom
 * was last month; an inverted rule puts them back to active overnight
 * and they would never work out why.
 *
 * A future booking cannot be set by accident and means only one thing:
 * this client is coming in. Reactivating on that is right whoever marked
 * them inactive and whyever they did.
 *
 * ## blocked is never touched
 *
 * `blocked` is the salon saying no. It is not a staleness state and
 * nothing automatic may lift it — a client blocked after an incident
 * who somehow gets booked in must stay blocked, loudly, rather than
 * being quietly restored by a nightly job.
 *
 * `lapsed` is left alone for the opposite reason: it is computed on the
 * Reporting page against each household's own rhythm, and shared/
 * clientStatus.ts explains why a column can never say what that report
 * says.
 */
export type ReactivateDecision =
  | { markActive: true }
  | { markActive: false; reason: ReactivateSkipReason };

export type ReactivateSkipReason =
  /** Already active, or blocked, or lapsed — none of them ours to change. */
  | "not_inactive"
  /** Nothing in the diary, so nothing has changed about them. */
  | "nothing_booked";

export const REACTIVATE_SKIP_LABEL: Record<ReactivateSkipReason, string> = {
  not_inactive: "not an inactive client",
  nothing_booked: "nothing booked, so still gone",
};

export function decideReactivate(input: {
  status: string;
  hasFutureBooking: boolean;
}): ReactivateDecision {
  if (input.status !== "inactive") return { markActive: false, reason: "not_inactive" };
  if (!input.hasFutureBooking) return { markActive: false, reason: "nothing_booked" };
  return { markActive: true };
}
