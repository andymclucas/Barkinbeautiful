import { describe, expect, it } from "vitest";
import {
  liveSiblings,
  sameColumnSiblings,
  columnCardMembers,
  bookingCardKey,
} from "@shared/bookingSiblings";

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

/**
 * Mike Graham's Wednesday, 11/11/2026. Andy, with a photo of the board:
 * "There is also duplicates for Nov 11 for Benji & Sweety Graham - they are
 * under Stephanie & also in unassigned. How does this happen?"
 *
 * They were not duplicates. One appointment per dog, both at 08:00, Benji
 * with nobody against him and Sweety with Stephanie — so a card in each
 * column is correct. Both cards named the whole booking, so both read
 * "Benji & Sweety Graham · 2 dogs", and the same pair of names in two
 * columns reads as one booking entered twice.
 *
 * 107 upcoming bookings were split across two columns that day, so 107
 * pairs of cards were naming each other's dogs.
 */
describe("a split family names its own dogs in each column", () => {
  const at = (id: number, staffId: number | null, start = "2026-11-11T08:00:00+10:00") =>
    ({ id, staffId, sessionId: "0YiggfG7WajTWfXJ", workflowState: "scheduled", status: "confirmed", scheduledStart: start });

  const benji = at(1200221, null);
  const sweety = at(2550079, 60004);
  const booking = [benji, sweety];

  it("draws one card in each column, each naming one dog", () => {
    const unassignedColumn = columnCardMembers([benji]);
    const stephaniesColumn = columnCardMembers([sweety]);

    expect([...unassignedColumn.keys()]).toEqual([benji.id]);
    expect(unassignedColumn.get(benji.id)).toEqual([]);
    expect([...stephaniesColumn.keys()]).toEqual([sweety.id]);
    expect(stephaniesColumn.get(sweety.id)).toEqual([]);
  });

  it("keeps the booking whole for the price and the count", () => {
    // Andy, 09/11/2026: "Booking should span both columns still."
    expect(liveSiblings(benji, booking).map((a) => a.id)).toEqual([sweety.id]);
    expect(liveSiblings(sweety, booking).map((a) => a.id)).toEqual([benji.id]);
  });

  it("names only the column's dogs in the week list and the chips", () => {
    expect(sameColumnSiblings(benji, liveSiblings(benji, booking))).toEqual([]);
    expect(sameColumnSiblings(sweety, liveSiblings(sweety, booking))).toEqual([]);
  });

  it("still groups two dogs that are with the SAME groomer", () => {
    const together = [at(1200221, 60004), sweety];
    const column = columnCardMembers(together);
    expect([...column.keys()]).toEqual([1200221]);
    expect(column.get(1200221)?.map((a) => a.id)).toEqual([sweety.id]);
    expect(sameColumnSiblings(together[0], liveSiblings(together[0], together)).map((a) => a.id))
      .toEqual([sweety.id]);
  });

  it("groups two unassigned dogs together, because Unassigned is a column", () => {
    const bothLoose = [benji, at(2550079, null)];
    expect(sameColumnSiblings(benji, liveSiblings(benji, bothLoose)).map((a) => a.id))
      .toEqual([2550079]);
  });

  it("narrows nothing for a caller that has no staff field", () => {
    // The dialog and the pricing panel pass appointments without one.
    const a = { id: 1, sessionId: "s1", workflowState: "scheduled", status: "confirmed" };
    const b = { id: 2, sessionId: "s1", workflowState: "scheduled", status: "confirmed" };
    expect(sameColumnSiblings(a, [b]).map((x) => x.id)).toEqual([2]);
  });

  it("does not collapse a dog at a different time into the column's card", () => {
    // Minnie Condon's failure, through the real collapse this time.
    const later = at(2580020, null, "2026-11-11T12:00:00+10:00");
    const column = columnCardMembers([benji, later]);
    expect([...column.keys()].sort((x, y) => x - y)).toEqual([benji.id, later.id]);
    expect(column.get(later.id)).toEqual([]);
  });
});

/**
 * Cleo and Jamie Speck, 10/09/2026, 08:30, both against staff 5 in one
 * column. Cleo's row (840002) was cancelled; Jamie's (840003) was live and
 * was in fact groomed that day.
 *
 * The collapse keeps the LOWEST id, and liveSiblings gives a cancelled dog
 * no siblings — so the board drew Cleo's cancelled card alone and dropped
 * Jamie from the column entirely. Found on 09/11/2026 while fixing the
 * Graham labels; one booking in the whole history, and it was in the past.
 */
describe("a cancelled dog cannot hide the live dog beside it", () => {
  const speck = (id: number, cancelled: boolean) =>
    ({
      id,
      staffId: 5,
      sessionId: "qFttdvLHRxkrRnbm",
      workflowState: cancelled ? "cancelled" : "complete",
      status: cancelled ? "cancelled" : "confirmed",
      scheduledStart: "2026-09-10T08:30:00+10:00",
    });

  const cleo = speck(840002, true);
  const jamie = speck(840003, false);

  it("draws both, each on its own card", () => {
    const column = columnCardMembers([cleo, jamie]);
    expect([...column.keys()].sort((a, b) => a - b)).toEqual([840002, 840003]);
    expect(column.get(840002)).toEqual([]);
    expect(column.get(840003)).toEqual([]);
  });

  it("gives a dead row a card key of its own", () => {
    expect(bookingCardKey(cleo)).not.toBe(bookingCardKey(jamie));
    expect(bookingCardKey(cleo)).toContain("dead:");
  });

  it("keeps two live dogs on one card", () => {
    const bothLive = [speck(840002, false), jamie];
    const column = columnCardMembers(bothLive);
    expect([...column.keys()]).toEqual([840002]);
    expect(column.get(840002)?.map((a) => a.id)).toEqual([840003]);
  });
});
