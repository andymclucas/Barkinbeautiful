import { describe, it, expect } from "vitest";
import {
  sessionDividerTop, AFTERNOON_SESSION_START,
  minutesIntoLocalDay, afternoonSessionRowIndex,
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
