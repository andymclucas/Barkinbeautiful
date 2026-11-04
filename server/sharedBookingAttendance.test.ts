import { describe, it, expect } from "vitest";
import {
  attendanceDecision,
  bookingAttendance,
  describeRemoval,
  describeAttendance,
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
    for (const state of ["checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready"]) {
      const decision = attendanceDecision(dog({ workflowState: state }));
      expect(decision.action, state).toBe("blocked");
      if (decision.action === "blocked") expect(decision.reason).toContain("Teddy");
    }
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
