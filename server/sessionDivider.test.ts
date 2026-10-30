import { describe, it, expect } from "vitest";
import { summariseCalendar } from "@shared/calendarSummary";
import {
  sessionDividerTop, AFTERNOON_SESSION_START,
  minutesIntoLocalDay, afternoonSessionRowIndex, sessionDogCounts,
} from "@shared/sessionDivider";

const grid = { dayStartHour: 7, dayEndHour: 19, hourHeight: 72 };

describe("sessionDividerTop", () => {
  it("puts 11:30 four and a half hours down a day that starts at 7", () => {
    expect(sessionDividerTop(grid)).toBe(4.5 * 72);
  });

  it("returns null when the split is before the calendar's first hour", () => {
    // A clamped line would say the afternoon starts at 7am.
    expect(sessionDividerTop({ ...grid, dayStartHour: 12 })).toBeNull();
  });

  it("returns null when the split is after the calendar's last hour", () => {
    expect(sessionDividerTop({ ...grid, dayEndHour: 10 })).toBeNull();
  });

  it("draws at the very top when the day starts exactly on the split", () => {
    expect(sessionDividerTop({ ...grid, dayStartHour: 11.5 })).toBe(0);
  });

  it("takes a different split, for when this becomes a per-salon setting", () => {
    expect(sessionDividerTop({ ...grid, split: { hour: 13, minute: 0 } })).toBe(6 * 72);
  });

  it("is the salon's actual split", () => {
    expect(AFTERNOON_SESSION_START).toEqual({ hour: 11, minute: 30 });
  });
});

describe("minutesIntoLocalDay", () => {
  it("reads the salon's clock, not the machine's", () => {
    // 01:30 UTC on 30/10 is 11:30 Brisbane the same day.
    expect(minutesIntoLocalDay("2026-10-30T01:30:00Z")).toBe(11 * 60 + 30);
    expect(minutesIntoLocalDay("2026-10-29T21:30:00Z")).toBe(7 * 60 + 30);
  });

  it("gives a different answer for a different salon timezone", () => {
    expect(minutesIntoLocalDay("2026-10-30T01:30:00Z", "Australia/Perth")).toBe(9 * 60 + 30);
  });

  it("refuses an unreadable time rather than guessing midnight", () => {
    expect(minutesIntoLocalDay("not a time")).toBeNull();
  });
});

describe("afternoonSessionRowIndex", () => {
  /** Brisbane wall-clock on 30/10/2026. */
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(2026, 9, 30, h - 10, m)).toISOString();
  };
  const row = (id: number, time: string, family?: number) =>
    ({ id, scheduledStart: at(time), petFamilyGroupId: family ?? null });

  /** The board Lauren sent: the line goes after Pippa, before Peaches. */
  it("puts the line between the last morning dog and the first afternoon one", () => {
    const rows = [
      row(1, "09:00"), row(2, "09:30"), row(3, "09:30"), row(4, "09:30"),
      row(5, "11:30"), row(6, "11:30"), row(7, "11:30"),
    ];
    expect(afternoonSessionRowIndex(rows)).toBe(4);
  });

  it("counts 11:30 itself as the afternoon, not the end of the morning", () => {
    expect(afternoonSessionRowIndex([row(1, "11:29"), row(2, "11:30")])).toBe(1);
  });

  /**
   * The case that would cut a family in half. groupFamilyWorkflowRows
   * anchors a cohort to its earliest member, so these two sit together
   * at 11:00 — the divider belongs AFTER both, not between them.
   */
  it("keeps a family together when its siblings straddle the split", () => {
    const rows = [
      row(1, "09:00"),
      row(2, "11:00", 42), row(3, "11:45", 42),   // one cohort, anchored 11:00
      row(4, "12:00"),
    ];
    expect(afternoonSessionRowIndex(rows)).toBe(3);
  });

  it("still splits before a family that is wholly in the afternoon", () => {
    const rows = [row(1, "09:00"), row(2, "11:30", 7), row(3, "11:45", 7)];
    expect(afternoonSessionRowIndex(rows)).toBe(1);
  });

  it("draws nothing when the whole day is one session", () => {
    expect(afternoonSessionRowIndex([row(1, "08:00"), row(2, "09:00")])).toBeNull();
    expect(afternoonSessionRowIndex([row(1, "12:00"), row(2, "13:00")])).toBeNull();
    expect(afternoonSessionRowIndex([])).toBeNull();
  });

  it("ignores a row whose time cannot be read rather than dividing on it", () => {
    const rows = [row(1, "09:00"), { id: 2, scheduledStart: "rubbish", petFamilyGroupId: null }, row(3, "11:30")];
    expect(afternoonSessionRowIndex(rows)).toBe(2);
  });

  it("honours a salon that splits its day somewhere else", () => {
    const rows = [row(1, "09:00"), row(2, "10:00"), row(3, "11:30")];
    expect(afternoonSessionRowIndex(rows, { split: { hour: 10, minute: 0 } })).toBe(1);
  });
});

describe("sessionDogCounts", () => {
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(2026, 9, 30, h - 10, m)).toISOString();
  };
  const row = (id: number, time: string, family?: number) =>
    ({ id, scheduledStart: at(time), petFamilyGroupId: family ?? null });

  it("counts each half of the day", () => {
    const rows = [row(1, "09:00"), row(2, "09:30"), row(3, "11:30"), row(4, "14:00")];
    expect(sessionDogCounts(rows)).toEqual({ morning: 2, afternoon: 2, unknown: 0, total: 4, excluded: 0 });
  });

  it("puts 11:30 itself in the afternoon", () => {
    expect(sessionDogCounts([row(1, "11:29"), row(2, "11:30")]))
      .toMatchObject({ morning: 1, afternoon: 1 });
  });

  it("counts a whole day in one session", () => {
    expect(sessionDogCounts([row(1, "08:00"), row(2, "09:00")]))
      .toMatchObject({ morning: 2, afternoon: 0 });
    expect(sessionDogCounts([row(1, "13:00"), row(2, "15:00")]))
      .toMatchObject({ morning: 0, afternoon: 2 });
  });

  it("is zero all round for an empty day", () => {
    expect(sessionDogCounts([])).toEqual({ morning: 0, afternoon: 0, unknown: 0, total: 0, excluded: 0 });
  });

  /** A family counts where its cohort sits, the same as the line. */
  it("counts a straddling family entirely in the morning", () => {
    const rows = [row(1, "09:00"), row(2, "11:00", 42), row(3, "11:45", 42), row(4, "12:00")];
    expect(sessionDogCounts(rows)).toMatchObject({ morning: 3, afternoon: 1 });
  });

  it("holds an unreadable time apart rather than inflating a session", () => {
    const rows = [row(1, "09:00"), { id: 2, scheduledStart: "rubbish", petFamilyGroupId: null }];
    expect(sessionDogCounts(rows)).toEqual({ morning: 1, afternoon: 0, unknown: 1, total: 2, excluded: 0 });
  });

  /**
   * The invariant that matters on screen: the divider's index IS the
   * number of dogs above it. A board showing five rows before the line
   * and "Morning 4" would be worse than showing neither.
   */
  it("agrees with where the divider is drawn", () => {
    const days = [
      [row(1, "09:00"), row(2, "09:30"), row(3, "11:30"), row(4, "14:00")],
      [row(1, "09:00"), row(2, "11:00", 42), row(3, "11:45", 42), row(4, "12:00")],
      [row(1, "08:00"), row(2, "09:00")],
      [row(1, "13:00"), row(2, "15:00")],
      [row(1, "09:00"), row(2, "11:30"), row(3, "11:30"), row(4, "11:45", 9), row(5, "12:30", 9)],
    ];
    for (const rows of days) {
      const index = afternoonSessionRowIndex(rows);
      const { morning } = sessionDogCounts(rows);
      if (index !== null) expect(index, JSON.stringify(rows.map(r => r.scheduledStart))).toBe(morning);
      else expect(morning === 0 || morning === rows.length).toBe(true);
    }
  });
});

/**
 * A cancelled dog still renders on the board — staff want to see that a
 * slot came free — but it is not work. Counting them inflated the
 * morning by every dog who was not coming: on 30/10/2026 the calendar
 * header read 38 against 36 dogs actually due, and the morning figure
 * next to it included both cancellations.
 */
describe("dogs who are not coming", () => {
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(2026, 9, 30, h - 10, m)).toISOString();
  };
  const row = (id: number, time: string, extra: Record<string, unknown> = {}) =>
    ({ id, scheduledStart: at(time), petFamilyGroupId: null, ...extra });

  it("leaves a cancelled dog out of the morning", () => {
    const rows = [row(1, "09:00"), row(2, "09:30", { status: "cancelled" }), row(3, "10:00")];
    expect(sessionDogCounts(rows)).toMatchObject({ morning: 2, total: 2, excluded: 1 });
  });

  it("reads either column, because they are written independently", () => {
    expect(sessionDogCounts([row(1, "09:00", { workflowState: "cancelled" })]).excluded).toBe(1);
    expect(sessionDogCounts([row(1, "09:00", { status: "no_show" })]).excluded).toBe(1);
    expect(sessionDogCounts([row(1, "09:00", { workflowState: "no_show" })]).excluded).toBe(1);
  });

  it("keeps a dog who is simply not finished yet", () => {
    for (const state of ["scheduled", "checked_in", "bathing", "ready", "complete"]) {
      expect(sessionDogCounts([row(1, "09:00", { workflowState: state })]).total, state).toBe(1);
    }
  });

  it("counts a family booking as its dogs, not as one booking", () => {
    // The Mcconnons on 30/10/2026: four dogs, one booking.
    const rows = [
      row(1, "08:00", { petFamilyGroupId: 9 }), row(2, "08:00", { petFamilyGroupId: 9 }),
      row(3, "08:00", { petFamilyGroupId: 9 }), row(4, "08:00", { petFamilyGroupId: 9 }),
    ];
    expect(sessionDogCounts(rows)).toMatchObject({ morning: 4, total: 4 });
  });

  it("still adds up", () => {
    const rows = [
      row(1, "09:00"), row(2, "09:30", { status: "cancelled" }),
      row(3, "12:00"), row(4, "13:00", { workflowState: "no_show" }),
      { id: 5, scheduledStart: "rubbish", petFamilyGroupId: null },
    ];
    const c = sessionDogCounts(rows);
    expect(c.morning + c.afternoon + c.unknown).toBe(c.total);
    expect(c.total + c.excluded).toBe(rows.length);
  });
});

/**
 * The three numbers on the calendar header disagreed with each other:
 * 38 appointments, 36 in the sidebar, and a morning + afternoon that
 * matched neither. They are all meant to answer "how many dogs today".
 *
 * Pinned at the shared level, over the same list, because that is the
 * only place the agreement can be checked without rendering a page.
 */
describe("the day's counters agree", () => {
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(2026, 9, 30, h - 10, m)).toISOString();
  };
  const row = (id: number, time: string, extra: Record<string, unknown> = {}) =>
    ({ id, petId: id, scheduledStart: at(time), petFamilyGroupId: null, price: "80.00", ...extra });

  const days = [
    [row(1, "09:00"), row(2, "09:30"), row(3, "12:00")],
    [row(1, "09:00", { status: "cancelled" }), row(2, "09:30"), row(3, "12:00", { workflowState: "no_show" })],
    [row(1, "08:00", { petFamilyGroupId: 9 }), row(2, "08:00", { petFamilyGroupId: 9 }),
     row(3, "08:00", { petFamilyGroupId: 9 }), row(4, "08:00", { petFamilyGroupId: 9 })],
    [],
  ];

  it("the halves add up to the sidebar's total", () => {
    for (const rows of days) {
      const counts = sessionDogCounts(rows);
      const summary = summariseCalendar(rows as never);
      expect(counts.total, JSON.stringify(rows.map((r) => r.id))).toBe(summary.totalAppointments);
      expect(counts.morning + counts.afternoon + counts.unknown).toBe(counts.total);
    }
  });

  it("they drop the same dogs", () => {
    for (const rows of days) {
      expect(sessionDogCounts(rows).excluded).toBe(summariseCalendar(rows as never).cancelledCount);
    }
  });
});
