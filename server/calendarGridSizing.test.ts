import { describe, expect, it } from "vitest";
import {
  READABLE_STAFF_COLUMN_WIDTH,
  getDayCalendarGridSizing,
} from "../client/src/lib/calendarGridSizing";

describe("getDayCalendarGridSizing", () => {
  it("gives every staff member a fixed readable width and makes the total grid scrollable", () => {
    const sizing = getDayCalendarGridSizing(9, 52);

    expect(READABLE_STAFF_COLUMN_WIDTH).toBe(320);
    expect(sizing.totalWidth).toBe(2932);
    expect(sizing.gridTemplateColumns).toBe("52px repeat(9, 320px)");
  });

  it("keeps a safe staff track for the unassigned fallback column", () => {
    const sizing = getDayCalendarGridSizing(0, 52);

    expect(sizing.totalWidth).toBe(372);
    expect(sizing.gridTemplateColumns).toBe("52px repeat(1, 320px)");
  });
});
