import { describe, expect, it } from "vitest";
import { liveSiblings } from "@shared/bookingSiblings";

const appt = (id: number, state: string, sessionId: string | null = "s1") =>
  ({ id, sessionId, workflowState: state, status: state === "cancelled" ? "cancelled" : "confirmed" });

describe("who else is on this booking", () => {
  it("leaves a cancelled dog out of a live booking's siblings", () => {
    // The 09/10/2026 report: a one-dog booking reading "2 DOGS" because the
    // session still held the dog that had been cancelled.
    const murphy = appt(1, "checked_in");
    const eddieCancelled = appt(2, "cancelled");
    expect(liveSiblings(murphy, [murphy, eddieCancelled])).toEqual([]);
  });

  it("still groups two dogs that are both coming in", () => {
    const murphy = appt(1, "checked_in");
    const eddie = appt(2, "scheduled");
    expect(liveSiblings(murphy, [murphy, eddie]).map(a => a.id)).toEqual([2]);
  });

  it("draws a cancelled dog on its own, not under the live dogs' names", () => {
    const cancelled = appt(1, "cancelled");
    const live = appt(2, "scheduled");
    expect(liveSiblings(cancelled, [cancelled, live])).toEqual([]);
  });

  it("treats a no-show the same as a cancellation", () => {
    const live = appt(1, "checked_in");
    const noShow = { id: 2, sessionId: "s1", workflowState: "no_show", status: "no_show" };
    expect(liveSiblings(live, [live, noShow])).toEqual([]);
  });

  it("has no siblings without a session", () => {
    const lone = appt(1, "scheduled", null);
    expect(liveSiblings(lone, [lone, appt(2, "scheduled")])).toEqual([]);
  });
});
