import { describe, it, expect } from "vitest";
import { agendaRows, describeGroup } from "@shared/agendaGrouping";

const at = (h: number, m = 0) => new Date(2026, 10, 6, h, m).toISOString();

const appt = (over: Partial<Parameters<typeof agendaRows>[0][number]> & { id: number }) => ({
  sessionId: null, scheduledStart: at(12, 30), status: "confirmed", workflowState: "scheduled", ...over,
});

const shape = (rows: ReturnType<typeof agendaRows>) =>
  rows.map((r) => [r.appointment.id, r.groupSize, r.position]);

describe("agendaRows", () => {
  it("brackets the dogs of one booking, first to last", () => {
    const rows = agendaRows([
      appt({ id: 3, sessionId: "s1" }),
      appt({ id: 1, sessionId: "s1" }),
      appt({ id: 2, sessionId: "s1" }),
    ]);
    expect(shape(rows)).toEqual([[1, 3, "first"], [2, 3, "middle"], [3, 3, "last"]]);
    expect(rows.map((r) => r.indexInGroup)).toEqual([1, 2, 3]);
  });

  it("leaves a dog booked on its own alone", () => {
    expect(shape(agendaRows([appt({ id: 9 })]))).toEqual([[9, 1, "only"]]);
  });

  it("sorts by time first", () => {
    const rows = agendaRows([
      appt({ id: 2, scheduledStart: at(14) }),
      appt({ id: 1, scheduledStart: at(9) }),
    ]);
    expect(rows.map((r) => r.appointment.id)).toEqual([1, 2]);
  });

  /*
   * The failure this exists to stop: two families at 12:30, rows
   * interleaved by whatever order the query returned, and a bracket
   * drawn around rows 1 and 3.
   */
  it("never interleaves two bookings at the same time", () => {
    const rows = agendaRows([
      appt({ id: 10, sessionId: "aaa" }),
      appt({ id: 11, sessionId: "bbb" }),
      appt({ id: 12, sessionId: "aaa" }),
      appt({ id: 13, sessionId: "bbb" }),
    ]);
    expect(rows.map((r) => r.appointment.sessionId)).toEqual(["aaa", "aaa", "bbb", "bbb"]);
    expect(shape(rows)).toEqual([
      [10, 2, "first"], [12, 2, "last"], [11, 2, "first"], [13, 2, "last"],
    ]);
  });

  /*
   * The bracket answers "who leaves together", so a dog who is not
   * coming is not in it — and must not sit in the middle of it either,
   * or it splits the bracket in half.
   */
  it("drops a cancelled dog out of the group and sorts it to the end of the booking", () => {
    const rows = agendaRows([
      appt({ id: 20, sessionId: "s1" }),
      appt({ id: 21, sessionId: "s1", status: "cancelled", workflowState: "cancelled" }),
      appt({ id: 22, sessionId: "s1" }),
    ]);
    expect(shape(rows)).toEqual([[20, 2, "first"], [22, 2, "last"], [21, 1, "only"]]);
  });

  it("reads not-coming from either column", () => {
    for (const over of [
      { status: "cancelled", workflowState: "scheduled" },
      { status: "confirmed", workflowState: "cancelled" },
      { status: "no_show", workflowState: "scheduled" },
    ]) {
      const rows = agendaRows([
        appt({ id: 30, sessionId: "s1" }),
        appt({ id: 31, sessionId: "s1", ...over }),
      ]);
      expect(shape(rows), JSON.stringify(over)).toEqual([[30, 1, "only"], [31, 1, "only"]]);
    }
  });

  it("treats a pending MoeGo import as a dog that is coming", () => {
    const rows = agendaRows([
      appt({ id: 40, sessionId: "s1", status: "pending" }),
      appt({ id: 41, sessionId: "s1", status: "pending" }),
    ]);
    expect(shape(rows)).toEqual([[40, 2, "first"], [41, 2, "last"]]);
  });

  it("does not bracket two dogs that merely share a time", () => {
    const rows = agendaRows([appt({ id: 50 }), appt({ id: 51 })]);
    expect(shape(rows)).toEqual([[50, 1, "only"], [51, 1, "only"]]);
  });

  it("puts an unparseable date last instead of scrambling the list", () => {
    const rows = agendaRows([
      appt({ id: 61, scheduledStart: "not a date" }),
      appt({ id: 60, scheduledStart: at(9) }),
    ]);
    expect(rows.map((r) => r.appointment.id)).toEqual([60, 61]);
  });

  it("returns nothing for an empty day", () => {
    expect(agendaRows([])).toEqual([]);
  });
});

describe("describeGroup", () => {
  it("says how many go together", () => {
    expect(describeGroup(3)).toBe("Together · 3 dogs");
  });
  it("says nothing for a dog on its own", () => {
    expect(describeGroup(1)).toBeNull();
  });
});
