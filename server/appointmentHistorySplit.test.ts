import { describe, it, expect } from "vitest";
import { splitAppointmentsByTime, isStillToCome } from "@shared/appointmentHistorySplit";

const NOW = new Date("2026-10-01T04:00:00Z");
const appt = (id: number, iso: string, over: Record<string, unknown> = {}) =>
  ({ id, scheduledStart: iso, status: "scheduled", ...over });

describe("isStillToCome", () => {
  it("counts a future booking as upcoming and a past one as history", () => {
    expect(isStillToCome(appt(1, "2026-10-08T00:00:00Z"), NOW)).toBe(true);
    expect(isStillToCome(appt(2, "2026-09-24T00:00:00Z"), NOW)).toBe(false);
  });

  it("puts a cancelled or no-show future booking in history", () => {
    // A cancelled booking next Tuesday is not something the client is coming to.
    expect(isStillToCome(appt(3, "2026-10-08T00:00:00Z", { status: "cancelled" }), NOW)).toBe(false);
    expect(isStillToCome(appt(4, "2026-10-08T00:00:00Z", { status: "no_show" }), NOW)).toBe(false);
    expect(isStillToCome(appt(5, "2026-10-08T00:00:00Z", { workflowState: "cancelled" }), NOW)).toBe(false);
  });

  it("treats an appointment starting exactly now as upcoming", () => {
    expect(isStillToCome(appt(6, NOW.toISOString()), NOW)).toBe(true);
  });

  it("is not fooled by capitalisation", () => {
    expect(isStillToCome(appt(7, "2026-10-08T00:00:00Z", { status: "Cancelled" }), NOW)).toBe(false);
  });
});

describe("splitAppointmentsByTime", () => {
  it("orders upcoming soonest-first and past most-recent-first", () => {
    const rows = [
      appt(1, "2026-10-20T00:00:00Z"),
      appt(2, "2026-09-01T00:00:00Z"),
      appt(3, "2026-10-05T00:00:00Z"),
      appt(4, "2026-09-28T00:00:00Z"),
    ];
    const { upcoming, past } = splitAppointmentsByTime(rows, NOW);
    expect(upcoming.map(a => a.id)).toEqual([3, 1]);
    expect(past.map(a => a.id)).toEqual([4, 2]);
  });

  it("handles a client with nothing booked", () => {
    expect(splitAppointmentsByTime([], NOW)).toEqual({ upcoming: [], past: [] });
  });

  it("does not lose a row with an unparseable date", () => {
    const rows = [appt(1, "not a date"), appt(2, "2026-10-05T00:00:00Z")];
    const { upcoming, past } = splitAppointmentsByTime(rows, NOW);
    expect(upcoming.length + past.length).toBe(2);
  });

  it("does not mutate its input", () => {
    const rows = [appt(1, "2026-10-20T00:00:00Z"), appt(2, "2026-09-01T00:00:00Z")];
    const copy = [...rows];
    splitAppointmentsByTime(rows, NOW);
    expect(rows).toEqual(copy);
  });
});
