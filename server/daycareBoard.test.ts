import { describe, it, expect } from "vitest";
import {
  isDaycare, splitDaycare, daycarePresence, daycareTimes, overdueForCollection,
} from "../shared/daycareBoard";

const at = (iso: string) => new Date(iso);
const row = (over: Partial<Parameters<typeof daycarePresence>[0]> & Record<string, unknown> = {}) => ({
  id: 1, serviceType: "daycare", workflowState: "scheduled", status: "confirmed",
  scheduledStart: at("2026-10-28T21:30:00Z"),   // 7:30am Brisbane
  scheduledEnd: at("2026-10-29T06:00:00Z"),     // 4:00pm Brisbane
  checkedInAt: null, ...over,
});

describe("isDaycare", () => {
  it("picks out day care and nothing else", () => {
    expect(isDaycare({ serviceType: "daycare" })).toBe(true);
    expect(isDaycare({ serviceType: "DAYCARE" })).toBe(true);
    for (const service of ["classic_groom", "styled_groom", "bath_only", "fft", "deshed", "nail_trim", null]) {
      expect(isDaycare({ serviceType: service }), String(service)).toBe(false);
    }
  });
});

describe("splitDaycare", () => {
  it("separates the two boards and keeps each order", () => {
    const { grooming, daycare } = splitDaycare([
      { id: 1, serviceType: "classic_groom" },
      { id: 2, serviceType: "daycare" },
      { id: 3, serviceType: "bath_only" },
      { id: 4, serviceType: "daycare" },
    ]);
    expect(grooming.map((r) => r.id)).toEqual([1, 3]);
    expect(daycare.map((r) => r.id)).toEqual([2, 4]);
  });

  it("copes with a board of one kind, or none", () => {
    expect(splitDaycare([]).daycare).toEqual([]);
    expect(splitDaycare([{ id: 1, serviceType: "daycare" }]).grooming).toEqual([]);
  });
});

describe("daycarePresence", () => {
  it("is the three states that apply, and no others", () => {
    expect(daycarePresence(row())).toBe("expected");
    expect(daycarePresence(row({ checkedInAt: at("2026-10-28T22:10:00Z") }))).toBe("here");
    expect(daycarePresence(row({ workflowState: "complete" }))).toBe("gone");
  });

  it("calls a cancelled booking cancelled", () => {
    expect(daycarePresence(row({ workflowState: "cancelled" }))).toBe("cancelled");
    expect(daycarePresence(row({ status: "no_show" }))).toBe("cancelled");
  });

  /** Gone is gone, whether or not an arrival was ever recorded. */
  it("reports a finished booking as gone even with no check-in", () => {
    expect(daycarePresence(row({ workflowState: "complete", checkedInAt: null }))).toBe("gone");
  });
});

describe("daycareTimes", () => {
  it("shows the booked start until the dog actually turns up", () => {
    const times = daycareTimes(row());
    expect(times.in.toISOString()).toBe("2026-10-28T21:30:00.000Z");
    expect(times.arrived).toBe(false);
  });

  /**
   * A board showing 7:30 for a dog that arrived at 8:10 is telling the
   * floor something untrue.
   */
  it("shows the real arrival once there is one", () => {
    const times = daycareTimes(row({ checkedInAt: at("2026-10-28T22:10:00Z") }));
    expect(times.in.toISOString()).toBe("2026-10-28T22:10:00.000Z");
    expect(times.arrived).toBe(true);
  });

  it("always shows the booked end, which is who is still to collect", () => {
    expect(daycareTimes(row({ checkedInAt: at("2026-10-28T22:10:00Z") })).out.toISOString())
      .toBe("2026-10-29T06:00:00.000Z");
  });

  it("ignores an unreadable check-in rather than showing Invalid Date", () => {
    const times = daycareTimes(row({ checkedInAt: "not a date" }));
    expect(times.arrived).toBe(false);
    expect(Number.isNaN(times.in.getTime())).toBe(false);
  });
});

describe("overdueForCollection", () => {
  const here = row({ checkedInAt: at("2026-10-28T22:10:00Z") });

  it("flags a dog still here past its booked end", () => {
    expect(overdueForCollection(here, at("2026-10-29T06:30:00Z"))).toBe(true);
  });

  it("says nothing before the end", () => {
    expect(overdueForCollection(here, at("2026-10-29T05:30:00Z"))).toBe(false);
  });

  /** Already collected, or never arrived — neither is somebody running late. */
  it("does not flag a dog that has gone or has not come", () => {
    expect(overdueForCollection(row({ workflowState: "complete" }), at("2026-10-29T09:00:00Z"))).toBe(false);
    expect(overdueForCollection(row(), at("2026-10-29T09:00:00Z"))).toBe(false);
    expect(overdueForCollection(row({ workflowState: "cancelled" }), at("2026-10-29T09:00:00Z"))).toBe(false);
  });
});

describe("timestamps arriving as epoch milliseconds", () => {
  /**
   * The workflow board hands `checkedInAt` over as a NUMBER, the same
   * shape `completed_at` has. A Date-only type would have been a cast
   * at the call site and a wrong arrival time on the wall.
   */
  it("reads a numeric check-in as the arrival", () => {
    const arrivedAt = Date.UTC(2026, 9, 28, 22, 10);
    const times = daycareTimes({
      scheduledStart: Date.UTC(2026, 9, 28, 21, 30),
      scheduledEnd: Date.UTC(2026, 9, 29, 6, 0),
      checkedInAt: arrivedAt,
    });
    expect(times.arrived).toBe(true);
    expect(times.in.getTime()).toBe(arrivedAt);
    expect(times.out.getTime()).toBe(Date.UTC(2026, 9, 29, 6, 0));
  });

  it("treats a numeric booking with no check-in as not yet arrived", () => {
    const times = daycareTimes({
      scheduledStart: Date.UTC(2026, 9, 28, 21, 30),
      scheduledEnd: Date.UTC(2026, 9, 29, 6, 0),
      checkedInAt: null,
    });
    expect(times.arrived).toBe(false);
    expect(times.in.getTime()).toBe(Date.UTC(2026, 9, 28, 21, 30));
  });

  it("flags a numeric-timestamp dog as overdue", () => {
    expect(overdueForCollection({
      workflowState: "checked_in",
      status: "confirmed",
      checkedInAt: Date.UTC(2026, 9, 28, 22, 10),
      scheduledStart: Date.UTC(2026, 9, 28, 21, 30),
      scheduledEnd: Date.UTC(2026, 9, 29, 6, 0),
    }, new Date(Date.UTC(2026, 9, 29, 6, 30)))).toBe(true);
  });
});
