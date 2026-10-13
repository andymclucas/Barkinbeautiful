import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  isCancelledAppointment,
  preservesOriginalSchedule,
  canDragAppointment,
} from "@shared/cancelledAppointment";

describe("isCancelledAppointment", () => {
  it("accepts either column saying so", () => {
    // A booking cancelled through the MoeGo sync sets both columns; one
    // cancelled from the board may set only the workflow state. Checking
    // one misses the other.
    expect(isCancelledAppointment({ status: "cancelled", workflowState: "scheduled" })).toBe(true);
    expect(isCancelledAppointment({ status: "confirmed", workflowState: "cancelled" })).toBe(true);
    expect(isCancelledAppointment({ status: "cancelled", workflowState: "cancelled" })).toBe(true);
  });

  it("does not treat a no-show as a cancellation", () => {
    // Different thing commercially: a no-show was not called off, the dog
    // simply never arrived, and the salon may still charge for it.
    expect(isCancelledAppointment({ status: "no_show", workflowState: "no_show" })).toBe(false);
  });

  it("leaves a live booking alone", () => {
    expect(isCancelledAppointment({ status: "confirmed", workflowState: "grooming" })).toBe(false);
    expect(isCancelledAppointment({})).toBe(false);
    expect(isCancelledAppointment(null)).toBe(false);
    expect(isCancelledAppointment(undefined)).toBe(false);
  });
});

describe("preservesOriginalSchedule", () => {
  it("keeps an already-cancelled booking at its booked time", () => {
    // Cancelled appointments stay put for historical tracking: the timing
    // analytics and the day's revenue read those slots, so moving one
    // rewrites history.
    expect(preservesOriginalSchedule({ workflowState: "cancelled" }, "cancelled")).toBe(true);
  });

  it("also holds when the edit in progress is the cancellation", () => {
    // The dog is being cancelled at the time it was booked for, not at
    // whatever the form happens to be showing.
    expect(preservesOriginalSchedule({ status: "confirmed", workflowState: "ready" }, "cancelled")).toBe(true);
  });

  it("lets a live booking be rescheduled", () => {
    expect(preservesOriginalSchedule({ status: "confirmed", workflowState: "scheduled" }, "scheduled")).toBe(false);
    expect(preservesOriginalSchedule({ status: "confirmed", workflowState: "scheduled" }, null)).toBe(false);
  });
});

describe("canDragAppointment", () => {
  it("refuses to drag a cancelled dog", () => {
    expect(canDragAppointment({ workflowState: "cancelled" }, true)).toBe(false);
  });

  it("allows a live one when the board offers dragging", () => {
    expect(canDragAppointment({ workflowState: "scheduled" }, true)).toBe(true);
  });

  it("stays off where the surface does not drag at all", () => {
    // The wall display and the TV overlay pass no drag handler.
    expect(canDragAppointment({ workflowState: "scheduled" }, false)).toBe(false);
  });
});

describe("the rule has one copy", () => {
  it("Calendar.tsx no longer spells it out", () => {
    // It was written out four times there and three of those were pinned
    // as literal source strings by the old contract test — so a fifth copy,
    // or a changed one, was free to disagree with the rest.
    const calendar = readFileSync(
      new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");
    expect(calendar).not.toMatch(/status === "cancelled" \|\|[^\n]*workflowState === "cancelled"/);
    // Three call sites: the appointment card, the day-grid cell, and the
    // Unassigned strip under the board. The strip was the one place a
    // cancelled dog looked exactly like a live one, because it did not ask.
    // The import carries no paren so it does not count.
    expect(calendar.split("isCancelledAppointment(").length - 1).toBe(3);
    expect(calendar).toContain("preservesOriginalSchedule(editAppt, editForm.workflowState)");
  });
});
