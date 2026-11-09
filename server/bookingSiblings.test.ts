import { describe, expect, it } from "vitest";
import { liveSiblings, bookingCardKey } from "@shared/bookingSiblings";

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

/**
 * Kate Condon, 11/11/2026. Minnie 08:00 and Molly 12:00 in one session,
 * because only one of the two was moved. The board drew "Molly & Minnie ·
 * 2 DOGS · 12:00 pm" and Minnie's 08:00 row was not drawn anywhere, so a
 * dog was due at the salon and on nobody's column — and the staff member
 * who had moved it believed the move had worked because the card said so.
 */
describe("a dog at a different time is a different card", () => {
  const at = (id: number, start: string) =>
    ({ id, sessionId: "s1", workflowState: "scheduled", status: "confirmed", scheduledStart: start });

  const minnie = at(2580020, "2026-11-11T08:00:00+10:00");
  const molly = at(1200688, "2026-11-11T12:00:00+10:00");

  it("does not name the 8am dog on the 12pm card", () => {
    expect(liveSiblings(molly, [molly, minnie])).toEqual([]);
  });

  it("does not hide the 8am dog behind the lower id", () => {
    // The collapse keeps the LOWEST id per key. Molly's id is lower and
    // her time is later, which is exactly how Minnie disappeared.
    expect(bookingCardKey(minnie)).not.toBe(bookingCardKey(molly));
  });

  it("still groups two dogs that share a start", () => {
    const together = at(3, "2026-11-11T12:00:00+10:00");
    expect(liveSiblings(molly, [molly, together]).map(a => a.id)).toEqual([3]);
    expect(bookingCardKey(together)).toBe(bookingCardKey(molly));
  });

  it("reads the same instant written two ways as one card", () => {
    // 02:00Z is 12:00 Brisbane. Grouping on the text would split these.
    const utc = at(4, "2026-11-11T02:00:00Z");
    expect(bookingCardKey(utc)).toBe(bookingCardKey(molly));
    expect(liveSiblings(molly, [molly, utc]).map(a => a.id)).toEqual([4]);
  });

  it("leaves a caller with no times grouping by session alone", () => {
    // sharedBookingAttendance and agendaGrouping pass no scheduledStart.
    // They must keep working exactly as before rather than quietly
    // losing every sibling.
    const a = { id: 1, sessionId: "s1", workflowState: "scheduled", status: "confirmed" };
    const b = { id: 2, sessionId: "s1", workflowState: "scheduled", status: "confirmed" };
    expect(liveSiblings(a, [a, b]).map(x => x.id)).toEqual([2]);
  });
});
