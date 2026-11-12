import { describe, it, expect } from "vitest";
import {
  attendanceDecision,
  bookingAttendance,
  describeRemoval,
  describeAttendance,
  wholeBookingCancellation,
  describeWholeBookingCancellation,
} from "@shared/sharedBookingAttendance";

const dog = (over: Partial<Parameters<typeof attendanceDecision>[0]> = {}) => ({
  id: 1, petName: "Teddy", status: "confirmed", workflowState: "scheduled", ...over,
});

describe("attendanceDecision", () => {
  it("lets a dog still to come be marked as not coming", () => {
    expect(attendanceDecision(dog())).toEqual({ action: "remove", label: "Not coming" });
  });

  it("offers to put a cancelled dog back on", () => {
    expect(attendanceDecision(dog({ status: "cancelled", workflowState: "cancelled" })).action)
      .toBe("restore");
  });

  it("offers to put a no-show back on too — both mean not coming, and both can be a misclick", () => {
    expect(attendanceDecision(dog({ status: "no_show", workflowState: "no_show" })).action)
      .toBe("restore");
  });

  /*
   * The two columns disagree constantly: a booking cancelled through the
   * board may set only the workflow state, one cancelled through the
   * MoeGo sync sets both. Either column saying "not coming" settles it.
   */
  it("reads cancelled from EITHER column", () => {
    expect(attendanceDecision(dog({ status: "confirmed", workflowState: "cancelled" })).action)
      .toBe("restore");
    expect(attendanceDecision(dog({ status: "cancelled", workflowState: "scheduled" })).action)
      .toBe("restore");
  });

  /*
   * A cancelled row can carry a stale stage from before it was
   * cancelled. "Not coming" has to win, or a dog cancelled while
   * checked in reads as blocked and can never be put back.
   */
  it("prefers not-coming over a stale in-salon stage", () => {
    expect(attendanceDecision(dog({ status: "cancelled", workflowState: "bathing" })).action)
      .toBe("restore");
  });

  it("refuses a dog that is already at the salon, naming it", () => {
    for (const state of ["waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready"]) {
      const decision = attendanceDecision(dog({ workflowState: state }));
      expect(decision.action, state).toBe("blocked");
      if (decision.action === "blocked") expect(decision.reason).toContain("Teddy");
    }
  });

  /*
   * A family is checked in together at the door, so "checked in" can be
   * wrong about one of them. That dog must still be removable.
   */
  it("lets a dog that is only checked in be marked as not coming, flagged", () => {
    const decision = attendanceDecision(dog({ status: "confirmed", workflowState: "checked_in" }));
    expect(decision).toEqual({ action: "remove", label: "Not coming", checkedIn: true });
    expect(attendanceDecision(dog({ workflowState: "scheduled" }))).toEqual({ action: "remove", label: "Not coming" });
  });

  it("warns on the confirm when the dog is checked in", () => {
    expect(describeRemoval("Chloe", ["Mandy", "Misty"], true))
      .toBe("Chloe is checked in. Only do this if Chloe did not arrive. Chloe will be marked as not coming. Mandy and Misty stay booked at the same time.");
  });

  it("never takes a checked-in dog off through the whole-booking cancel", () => {
    const plan = wholeBookingCancellation([
      { id: 1, petName: "Chloe", workflowState: "checked_in" },
      { id: 2, petName: "Mandy", workflowState: "scheduled" },
    ]);
    expect(plan.cancel.map((r) => r.name)).toEqual(["Mandy"]);
    expect(plan.blocked.map((r) => r.name)).toEqual(["Chloe"]);
  });

  it("refuses a dog whose groom has happened", () => {
    const decision = attendanceDecision(dog({ workflowState: "complete" }));
    expect(decision.action).toBe("blocked");
    if (decision.action === "blocked") expect(decision.reason).toContain("already been groomed");
  });

  it("falls back to a usable name when the pet has none", () => {
    const decision = attendanceDecision(dog({ petName: "  ", workflowState: "grooming" }));
    if (decision.action === "blocked") expect(decision.reason).toContain("This dog");
  });

  it("treats a pending MoeGo import as still to come", () => {
    expect(attendanceDecision(dog({ status: "pending" })).action).toBe("remove");
  });
});

describe("bookingAttendance", () => {
  it("marks who is coming and keeps the given order", () => {
    const rows = bookingAttendance([
      dog({ id: 10, petName: "Teddy" }),
      dog({ id: 11, petName: "Stella", status: "cancelled", workflowState: "cancelled" }),
      dog({ id: 12, petName: "Belle" }),
    ]);
    expect(rows.map((r) => [r.name, r.coming])).toEqual([
      ["Teddy", true], ["Stella", false], ["Belle", true],
    ]);
  });

  it("never leaves a row without a name to click", () => {
    expect(bookingAttendance([dog({ id: 77, petName: null })])[0].name).toBe("Dog 77");
  });
});

describe("describeRemoval", () => {
  it("says the others keep their slot, because that is what staff expect it to break", () => {
    expect(describeRemoval("Teddy", ["Stella", "Belle"]))
      .toBe("Teddy will be marked as not coming. Stella and Belle stay booked at the same time.");
  });

  it("reads correctly for one remaining dog", () => {
    expect(describeRemoval("Teddy", ["Stella"])).toContain("Stella stays booked");
  });

  it("warns when it empties the booking", () => {
    expect(describeRemoval("Teddy", [])).toContain("leaves no dogs on this booking");
  });
});

describe("describeAttendance", () => {
  const rows = (...specs: Array<"come" | "done" | "off">) =>
    bookingAttendance(specs.map((spec, i) => ({
      id: i + 1, petName: `Dog${i + 1}`,
      status: spec === "off" ? "cancelled" : "confirmed",
      workflowState: spec === "off" ? "cancelled" : spec === "done" ? "complete" : "scheduled",
    })));

  it("offers the hint when a dog can still be marked off", () => {
    expect(describeAttendance(rows("come", "come")))
      .toBe("All 2 dogs coming. Marking one as not coming leaves the others at the same time.");
  });

  /*
   * The live bug. Eddy and Albert Hartney, both groomed that morning,
   * and the card said "2 of 2 coming".
   */
  it("does not say a groomed booking is coming", () => {
    expect(describeAttendance(rows("done", "done"))).toBe("All 2 dogs have been groomed.");
  });

  it("drops the hint when nothing can be marked off", () => {
    expect(describeAttendance(rows("done", "done"))).not.toContain("Marking one");
  });

  it("splits a part-groomed booking honestly", () => {
    expect(describeAttendance(rows("come", "done")))
      .toContain("1 dog still to come, 1 already groomed.");
  });

  it("counts the dogs that are off", () => {
    expect(describeAttendance(rows("come", "off", "come")))
      .toBe("1 dog not coming, 2 still booked. Marking one as not coming leaves the others at the same time.");
  });

  it("says so when the whole booking is off", () => {
    expect(describeAttendance(rows("off", "off"))).toBe("None of these dogs are coming.");
  });

  it("says nothing for no dogs", () => {
    expect(describeAttendance([])).toBe("");
  });
});

/**
 * Andy, 04/11/2026: "Build the cancel whole booking action."
 *
 * The reason it exists: cancelling a family dog by dog sends one text
 * per dog, because each press is a separate decision minutes apart and
 * nothing batches them. One action cancels them together, so the
 * notice finds them all at once and sends one text.
 */
describe("wholeBookingCancellation", () => {
  const dog = (id: number, name: string, state: "come" | "done" | "salon" | "off") => ({
    id, petName: name,
    status: state === "off" ? "cancelled" : "confirmed",
    workflowState: state === "off" ? "cancelled"
      : state === "done" ? "complete"
      : state === "salon" ? "bathing" : "scheduled",
  });

  it("cancels every dog still to come", () => {
    const plan = wholeBookingCancellation([
      dog(1, "Stella", "come"), dog(2, "Belle", "come"), dog(3, "Teddy", "come"),
    ]);
    expect(plan.cancel.map((r) => r.name)).toEqual(["Stella", "Belle", "Teddy"]);
    expect(plan.blocked).toEqual([]);
    expect(plan.alreadyOff).toEqual([]);
  });

  /*
   * Trap 4 of the MoeGo sync from the other side: a dog past scheduled
   * is on the floor and must not be taken off the board.
   */
  it("leaves a dog at the salon or already groomed alone", () => {
    const plan = wholeBookingCancellation([
      dog(1, "Stella", "come"), dog(2, "Belle", "salon"), dog(3, "Teddy", "done"),
    ]);
    expect(plan.cancel.map((r) => r.name)).toEqual(["Stella"]);
    expect(plan.blocked.map((r) => r.name)).toEqual(["Belle", "Teddy"]);
  });

  it("does not re-cancel a dog already off", () => {
    const plan = wholeBookingCancellation([dog(1, "Stella", "come"), dog(2, "Belle", "off")]);
    expect(plan.cancel.map((r) => r.name)).toEqual(["Stella"]);
    expect(plan.alreadyOff.map((r) => r.name)).toEqual(["Belle"]);
  });

  it("agrees exactly with the per-dog rule", () => {
    const dogs = [dog(1, "A", "come"), dog(2, "B", "salon"), dog(3, "C", "off"), dog(4, "D", "done")];
    const plan = wholeBookingCancellation(dogs);
    // By id, not by object identity: the plan builds its own rows, so
    // `includes` on a second bookingAttendance call never matches.
    const has = (rows: { id: number }[], id: number) => rows.some((r) => r.id === id);
    for (const row of bookingAttendance(dogs)) {
      const bucket = has(plan.cancel, row.id) ? "remove"
        : has(plan.blocked, row.id) ? "blocked"
        : has(plan.alreadyOff, row.id) ? "restore" : "missing";
      expect(bucket, row.name).toBe(row.action);
    }
  });
});

describe("describeWholeBookingCancellation", () => {
  const rows = (...specs: Array<["come" | "done" | "off", string]>) =>
    wholeBookingCancellation(specs.map(([state, name], i) => ({
      id: i + 1, petName: name,
      status: state === "off" ? "cancelled" : "confirmed",
      workflowState: state === "off" ? "cancelled" : state === "done" ? "complete" : "scheduled",
    })));

  it("names every dog and promises ONE text", () => {
    const line = describeWholeBookingCancellation(rows(["come", "Stella"], ["come", "Belle"], ["come", "Teddy"]));
    expect(line).toContain("All 3 dogs — Stella, Belle and Teddy");
    expect(line).toContain("one text naming all of them");
  });

  it("reads correctly for a single dog", () => {
    const line = describeWholeBookingCancellation(rows(["come", "Teddy"]));
    expect(line).toContain("Teddy will be marked as not coming");
    expect(line).toContain("one text naming them");
  });

  it("says which dogs are left alone and why", () => {
    const line = describeWholeBookingCancellation(rows(["come", "Stella"], ["done", "Belle"]));
    expect(line).toContain("Belle is left alone");
    expect(line).toContain("already at the salon or groomed");
  });

  it("says there is nothing to do rather than offering to do nothing", () => {
    expect(describeWholeBookingCancellation(rows(["done", "Belle"]))).toContain("Nothing to cancel");
    expect(describeWholeBookingCancellation(rows(["off", "Belle"]))).toContain("already cancelled");
  });
});
