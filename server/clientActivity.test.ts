import { describe, it, expect } from "vitest";
import {
  INACTIVE_AFTER_MONTHS,
  LIVE_MEMBERSHIP_STATUSES,
  NON_VISIT_STATES,
  decideInactive,
  inactiveCutoffDay,
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

  it("leaves alone anyone with no visit on record, unless asked", () => {
    // 8,319 clients are in this cohort and the data cannot tell "left
    // before the imported history starts in July 2024" from "enquired
    // once and never booked". Marking them is a decision, not a default.
    expect(decideInactive({ ...gone, lastVisitDay: null }))
      .toEqual({ markInactive: false, reason: "never_visited" });
    expect(decideInactive({ ...gone, lastVisitDay: null, includeNeverVisited: true }))
      .toEqual({ markInactive: true, lastVisitDay: null });
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
