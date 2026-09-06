import { describe, expect, it } from "vitest";
import { buildCalendarDragTargetMinutes, formatCalendarDragTargetTime } from "../shared/calendarDragTarget";

describe("calendar drag destination targeting", () => {
  it("rounds the visible destination to a 15-minute target while preserving the grab offset", () => {
    expect(buildCalendarDragTargetMinutes({
      clientY: 199,
      columnTop: 100,
      scrollTop: 72,
      grabOffsetY: 9,
      hourHeight: 72,
      latestStartMinutes: 720,
    })).toBe(135);
  });

  it("clamps a drag destination to the visible calendar range", () => {
    expect(buildCalendarDragTargetMinutes({ clientY: -100, columnTop: 0, scrollTop: 0, grabOffsetY: 0, hourHeight: 72, latestStartMinutes: 720 })).toBe(0);
    expect(buildCalendarDragTargetMinutes({ clientY: 2000, columnTop: 0, scrollTop: 0, grabOffsetY: 0, hourHeight: 72, latestStartMinutes: 720 })).toBe(720);
  });

  it("formats a destination using salon-visible 12-hour time", () => {
    expect(formatCalendarDragTargetTime(0)).toBe("7:00 am");
    expect(formatCalendarDragTargetTime(315)).toBe("12:15 pm");
  });
});
