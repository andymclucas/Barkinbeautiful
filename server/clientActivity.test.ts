import { describe, it, expect } from "vitest";
import {
  INACTIVE_AFTER_MONTHS,
  LIVE_MEMBERSHIP_STATUSES,
  NON_VISIT_STATES,
  decideInactive,
  inactiveCutoffDay,
  decideReactivate,
} from "@shared/clientActivity";
import { appointments, memberships } from "../drizzle/schema";
import { getTableColumns } from "drizzle-orm";

const BRISBANE = "Australia/Brisbane";

/** The shape the pass actually sees: an active client who has vanished. */
const gone = {
  status: "active",
  lastVisitDay: "2025-01-05",
  hasFutureBooking: false,
  hasLiveMembership: false,
  cutoffDay: "2025-11-07",
};

/**
 * Who gets marked inactive by the one-off pass.
 *
 * These matter more than most tests here: the pass writes a status to
 * several thousand real client rows and the previous value is recorded
 * nowhere, so a wrong decision is not readable back out of the database.
 */
describe("decideInactive", () => {
  it("marks an active client with no visit inside the window", () => {
    const d = decideInactive(gone);
    expect(d.markInactive).toBe(true);
  });

  /*
   * This used to assert the opposite — that an empty history was left
   * alone unless asked for — on the grounds that the data cannot tell
   * "left before the import starts in July 2024" from "never booked".
   *
   * That is still true and it turned out not to matter. Measured
   * 09/11/2026: the earliest appointment in Groomigo is 2024-07-21 and
   * the cutoff is 2025-11-09, so both readings are more than twelve
   * months old and land on the same side of the line. The old default
   * answered a narrower question than the one being asked.
   */
  it("counts no visit on record as gone", () => {
    expect(decideInactive({ ...gone, lastVisitDay: null }))
      .toEqual({ markInactive: true, lastVisitDay: null });
    expect(decideInactive({ ...gone, lastVisitDay: null, includeNeverVisited: true }))
      .toEqual({ markInactive: true, lastVisitDay: null });
  });

  it("can still be asked the narrower question", () => {
    // Deliberately false, not merely absent: "only the clients who
    // demonstrably came and then stopped" is a real question and the
    // caller has to ask for it.
    expect(decideInactive({ ...gone, lastVisitDay: null, includeNeverVisited: false }))
      .toEqual({ markInactive: false, reason: "never_visited" });
  });

  /*
   * The cohort is only safe to include while the cutoff is shorter than
   * the imported history is long. If somebody drops INACTIVE_AFTER_MONTHS
   * to six, a client who last came in August 2024 still reads as "never"
   * and would be marked on absent data rather than on evidence.
   */
  it("is only sound while the window is shorter than the imported history", () => {
    const EARLIEST_IMPORTED = "2024-07-21";
    const cutoff = inactiveCutoffDay(new Date("2026-11-09T00:00:00+10:00"), "Australia/Brisbane")!;
    expect(cutoff > EARLIEST_IMPORTED).toBe(true);
  });

  it("never marks a paying member", () => {
    // The worst single outcome of this pass. A member is paying weekly
    // whether or not they came in, and a paused membership is still a
    // membership — only cancelled and expired are not.
    const d = decideInactive({ ...gone, hasLiveMembership: true });
    expect(d).toEqual({ markInactive: false, reason: "has_live_membership" });
  });

  it("never marks somebody who is in the diary", () => {
    // Thirteen months since their last groom and booked for Thursday is
    // plainly a current client.
    const d = decideInactive({ ...gone, hasFutureBooking: true });
    expect(d).toEqual({ markInactive: false, reason: "has_future_booking" });
  });

  it("does not use created_at to judge newness", () => {
    // The first version skipped anyone created inside the window. That
    // column is 3 August 2026 for 10,075 of 10,114 rows — the MoeGo
    // merge date — so it skipped 9,150 clients and the pass marked
    // nobody. The decision must not depend on it, and now cannot:
    // there is no field for it to read.
    const d = decideInactive(gone);
    expect(d.markInactive).toBe(true);
  });

  it("never overwrites a status somebody chose by hand", () => {
    for (const status of ["blocked", "inactive", "lapsed"]) {
      expect(decideInactive({ ...gone, status }))
        .toEqual({ markInactive: false, reason: "not_active_status" });
    }
  });

  it("treats the cutoff day itself as a recent visit", () => {
    // Inclusive on purpose: a visit ON the boundary is inside the window.
    // Off by one here is a client marked inactive on the strength of a
    // groom they actually had.
    expect(decideInactive({ ...gone, lastVisitDay: gone.cutoffDay }))
      .toEqual({ markInactive: false, reason: "visited_inside_window" });
    expect(decideInactive({ ...gone, lastVisitDay: "2025-11-06" }).markInactive).toBe(true);
  });

  it("refuses for the single most important reason first", () => {
    // A member who is also booked in and also already blocked must come
    // back as one reason, not an arbitrary one, so the dry run's counts
    // add up to the number of clients considered.
    const d = decideInactive({
      ...gone, status: "blocked", hasLiveMembership: true, hasFutureBooking: true,
    });
    expect(d).toEqual({ markInactive: false, reason: "not_active_status" });
  });
});

describe("NON_VISIT_STATES", () => {
  it("counts a past scheduled booking as a visit", () => {
    // The whole correction. 7,189 appointments sit in `scheduled` with
    // past dates — imported MoeGo grooms the workflow never walked. Only
    // cancelled and no-show mean the dog did not come.
    expect(NON_VISIT_STATES).toEqual(["cancelled", "no_show"]);
    expect(NON_VISIT_STATES).not.toContain("scheduled");
    expect(NON_VISIT_STATES).not.toContain("complete");
  });

  it("names only states the column accepts", () => {
    const allowed = getTableColumns(appointments).workflowState.enumValues ?? [];
    for (const state of NON_VISIT_STATES) expect(allowed).toContain(state);
  });
});

describe("inactiveCutoffDay", () => {
  it("is twelve months back, on the salon's calendar", () => {
    expect(INACTIVE_AFTER_MONTHS).toBe(12);
    expect(inactiveCutoffDay(new Date("2026-11-07T04:00:00Z"), BRISBANE)).toBe("2025-11-07");
  });

  it("does not move with the time of day the pass runs", () => {
    // CURDATE() is UTC here, and a query run before 10am Brisbane reads
    // the previous day — that faked 31 missing dogs on 06/11/2026. Both
    // of these are the same Brisbane day, so both must give one answer.
    const earlyMorningBrisbane = new Date("2026-11-06T22:30:00Z"); // 08:30 on the 7th
    const lateEveningBrisbane = new Date("2026-11-07T12:30:00Z");  // 22:30 on the 7th
    expect(inactiveCutoffDay(earlyMorningBrisbane, BRISBANE))
      .toBe(inactiveCutoffDay(lateEveningBrisbane, BRISBANE));
  });

  it("handles a month-end date without rolling into the wrong month", () => {
    // 31 March back twelve months is 31 March, not 2 April. Date.UTC
    // normalises overflow, so this is worth pinning.
    expect(inactiveCutoffDay(new Date("2026-03-31T04:00:00Z"), BRISBANE)).toBe("2025-03-31");
  });
});

describe("LIVE_MEMBERSHIP_STATUSES", () => {
  it("names only statuses the column accepts", () => {
    // If a status is ever renamed, a typo here would silently stop
    // protecting paying members, which is the one failure this pass
    // cannot afford.
    const allowed = getTableColumns(memberships).status.enumValues ?? [];
    for (const status of LIVE_MEMBERSHIP_STATUSES) {
      expect(allowed).toContain(status);
    }
  });

  it("leaves out the two that mean they have gone", () => {
    expect(LIVE_MEMBERSHIP_STATUSES).not.toContain("cancelled");
    expect(LIVE_MEMBERSHIP_STATUSES).not.toContain("expired");
  });
});

/**
 * The other direction.
 *
 * Andy, 09/11/2026: "The rule should be in place." A pass that only
 * moves people one way goes stale the next morning — the first inactive
 * client somebody books in would stay inactive for ever, out of every
 * mass text, while their dog sits on the board.
 */
describe("decideReactivate", () => {
  it("brings an inactive client back when they are booked in", () => {
    expect(decideReactivate({ status: "inactive", hasFutureBooking: true }))
      .toEqual({ markActive: true });
  });

  it("leaves an inactive client alone while nothing is booked", () => {
    expect(decideReactivate({ status: "inactive", hasFutureBooking: false }))
      .toEqual({ markActive: false, reason: "nothing_booked" });
  });

  /*
   * The case this rule exists to protect, and the reason it is not the
   * inactive rule inverted. Staff who know a client has moved away mark
   * them inactive TODAY, while their last groom was last month. An
   * inverted rule — "active if they visited inside twelve months" —
   * would put them back overnight and nobody would work out why.
   */
  it("does not undo a status a person set by hand", () => {
    expect(decideReactivate({ status: "inactive", hasFutureBooking: false }))
      .toEqual({ markActive: false, reason: "nothing_booked" });
  });

  /*
   * blocked is the salon saying no. It is not staleness and nothing
   * automatic may lift it — a client blocked after an incident who
   * somehow gets booked in must stay blocked, loudly.
   */
  it("never lifts blocked, even with a booking in the diary", () => {
    expect(decideReactivate({ status: "blocked", hasFutureBooking: true }))
      .toEqual({ markActive: false, reason: "not_inactive" });
  });

  it("leaves lapsed to the report that computes it", () => {
    expect(decideReactivate({ status: "lapsed", hasFutureBooking: true }))
      .toEqual({ markActive: false, reason: "not_inactive" });
  });

  it("does nothing to someone already active", () => {
    expect(decideReactivate({ status: "active", hasFutureBooking: true }))
      .toEqual({ markActive: false, reason: "not_inactive" });
  });

  /*
   * The two halves must never both fire on one client, or a nightly
   * pass would flip them back and forth for ever.
   */
  it("cannot both deactivate and reactivate the same client", () => {
    const cutoffDay = "2025-11-09";
    for (const hasFutureBooking of [true, false]) {
      for (const lastVisitDay of [null, "2024-01-01", "2026-10-01"]) {
        const down = decideInactive({
          status: "active", lastVisitDay, hasFutureBooking,
          hasLiveMembership: false, cutoffDay,
        });
        const up = decideReactivate({ status: "inactive", hasFutureBooking });
        // They act on different starting statuses, so at most one can
        // ever apply to a given row — this pins that they also disagree
        // about a future booking in the same direction.
        if (down.markInactive) expect(hasFutureBooking).toBe(false);
        if (up.markActive) expect(hasFutureBooking).toBe(true);
      }
    }
  });
});
