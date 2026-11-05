import { describe, it, expect } from "vitest";
import { appointmentStack, MIN_DRAWN_MINUTES } from "@shared/appointmentStack";

const at = (hhmm: string) => new Date(`2026-11-05T${hhmm}:00+10:00`).getTime();
const appt = (id: number, start: string, end: string) => ({
  id,
  startMs: at(start),
  endMs: at(end),
});

describe("appointmentStack", () => {
  it("returns nothing when the card stands alone", () => {
    const items = [appt(1, "08:00", "09:00"), appt(2, "10:00", "11:00")];
    expect(appointmentStack(items, 1)).toEqual([]);
  });

  it("returns nothing for an unknown id", () => {
    expect(appointmentStack([appt(1, "08:00", "09:00")], 99)).toEqual([]);
  });

  it("names every card overlapping the tapped one, itself included", () => {
    const items = [
      appt(1, "08:00", "10:00"),
      appt(2, "08:30", "09:30"),
      appt(3, "09:00", "11:00"),
    ];
    expect(appointmentStack(items, 2).map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("excludes a cluster member that does not touch the tapped card", () => {
    // 1 overlaps 2, 2 overlaps 3, but 1 and 3 never share the screen.
    // computeColumns puts all three in one cluster; the picker must not.
    const items = [
      appt(1, "08:00", "09:00"),
      appt(2, "08:30", "09:30"),
      appt(3, "09:15", "10:15"),
    ];
    expect(appointmentStack(items, 1).map((s) => s.id)).toEqual([1, 2]);
    expect(appointmentStack(items, 3).map((s) => s.id)).toEqual([2, 3]);
  });

  it("treats cards as stacked when only the DRAWN height overlaps", () => {
    // Two back-to-back quarter hours: no overlap in the data, but the
    // first is drawn 30 minutes tall, so it sits over the second.
    const items = [appt(1, "09:00", "09:15"), appt(2, "09:15", "09:30")];
    expect(appointmentStack(items, 1).map((s) => s.id)).toEqual([1, 2]);
  });

  it("does not stack cards that abut at the drawn minimum", () => {
    const items = [appt(1, "09:00", "09:30"), appt(2, "09:30", "10:00")];
    expect(appointmentStack(items, 1)).toEqual([]);
  });

  it("orders the stack the way the cards are drawn", () => {
    const items = [
      appt(3, "09:00", "10:00"),
      appt(1, "08:00", "10:00"),
      appt(2, "08:00", "09:30"),
    ];
    expect(appointmentStack(items, 3).map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("pins the drawn minimum at the half hour the card layout uses", () => {
    expect(MIN_DRAWN_MINUTES).toBe(30);
  });
});
