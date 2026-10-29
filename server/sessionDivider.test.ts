import { describe, it, expect } from "vitest";
import { sessionDividerTop, AFTERNOON_SESSION_START } from "@shared/sessionDivider";

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
