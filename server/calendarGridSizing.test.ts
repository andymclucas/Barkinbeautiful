import { describe, expect, it } from "vitest";
import {
  READABLE_STAFF_COLUMN_WIDTH,
  MIN_STAFF_COLUMN_WIDTH,
  getDayCalendarGridSizing,
} from "../client/src/lib/calendarGridSizing";

/** A 1440px laptop with the sidebar and page padding taken off. */
const LAPTOP_BOARD = 1180;

describe("fitting the salon on one screen", () => {
  it("shrinks the columns so every staff member fits, rather than scrolling", () => {
    // The complaint this fixes: twelve staff at a flat 320px is a 3,892px
    // board, so finding which box a dog is in meant scrolling back and forth.
    const before = getDayCalendarGridSizing(12, 52).totalWidth;
    expect(before).toBe(3892);

    // (1180 - 52) / 12 = 94. The whole salon now fits one laptop screen.
    const sizing = getDayCalendarGridSizing(12, 52, { availableWidth: LAPTOP_BOARD });
    expect(sizing.staffColumnWidth).toBe(94);
    expect(sizing.totalWidth).toBe(LAPTOP_BOARD);
    expect(sizing.totalWidth).toBeLessThanOrEqual(LAPTOP_BOARD);
  });

  it("fills the width exactly when the columns fit", () => {
    const sizing = getDayCalendarGridSizing(6, 52, { availableWidth: LAPTOP_BOARD });
    // (1180 - 52) / 6 = 188
    expect(sizing.staffColumnWidth).toBe(188);
    expect(sizing.totalWidth).toBe(1180);
    expect(sizing.gridTemplateColumns).toBe("52px repeat(6, 188px)");
  });

  it("never stretches a column past what is readable", () => {
    // Two groomers on a wide monitor should not get 1,000px each.
    const sizing = getDayCalendarGridSizing(2, 52, { availableWidth: 2400 });
    expect(sizing.staffColumnWidth).toBe(READABLE_STAFF_COLUMN_WIDTH);
    expect(sizing.totalWidth).toBe(692);
  });

  it("stops shrinking at the floor and scrolls instead", () => {
    // A board you scroll beats a board you cannot read.
    const sizing = getDayCalendarGridSizing(12, 52, { availableWidth: 700 });
    expect(sizing.staffColumnWidth).toBe(MIN_STAFF_COLUMN_WIDTH);
    expect(sizing.totalWidth).toBeGreaterThan(700);
  });

  it("uses whole pixels, so no sliver of a column hangs off the edge", () => {
    const sizing = getDayCalendarGridSizing(7, 52, { availableWidth: 1181 });
    expect(Number.isInteger(sizing.staffColumnWidth)).toBe(true);
    expect(sizing.totalWidth).toBeLessThanOrEqual(1181);
  });
});

describe("before the board has been measured", () => {
  it("keeps the old readable width, so nothing flashes on first paint", () => {
    const sizing = getDayCalendarGridSizing(9, 52);
    expect(sizing.staffColumnWidth).toBe(READABLE_STAFF_COLUMN_WIDTH);
    expect(sizing.totalWidth).toBe(2932);
    expect(sizing.gridTemplateColumns).toBe("52px repeat(9, 320px)");
  });

  it("ignores a width that cannot be real", () => {
    // A hidden tab reports zero, and a width inside the time gutter is noise.
    for (const availableWidth of [0, -1, 40, Number.NaN]) {
      expect(getDayCalendarGridSizing(4, 52, { availableWidth }).staffColumnWidth)
        .toBe(READABLE_STAFF_COLUMN_WIDTH);
    }
  });

  it("keeps a staff track for the unassigned fallback column", () => {
    const sizing = getDayCalendarGridSizing(0, 52);
    expect(sizing.totalWidth).toBe(372);
    expect(sizing.gridTemplateColumns).toBe("52px repeat(1, 320px)");
  });
});
