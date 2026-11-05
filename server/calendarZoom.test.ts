import { describe, it, expect } from "vitest";
import {
  BASE_HOUR_HEIGHT,
  MIN_CALENDAR_ZOOM,
  MAX_CALENDAR_ZOOM,
  anchoredScrollTop,
  clampCalendarZoom,
  hourHeightFor,
  parseStoredZoom,
  steppedZoom,
  zoomFromPinch,
} from "@shared/calendarZoom";

describe("clampCalendarZoom", () => {
  it("holds the ends", () => {
    expect(clampCalendarZoom(0.1)).toBe(MIN_CALENDAR_ZOOM);
    expect(clampCalendarZoom(99)).toBe(MAX_CALENDAR_ZOOM);
    expect(clampCalendarZoom(1.5)).toBe(1.5);
  });

  it("falls back to 1 rather than NaN", () => {
    expect(clampCalendarZoom(Number.NaN)).toBe(1);
    expect(clampCalendarZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("hourHeightFor", () => {
  it("draws the board at its old height at zoom 1", () => {
    expect(hourHeightFor(1)).toBe(BASE_HOUR_HEIGHT);
  });

  it("returns whole pixels, so grid lines meet their labels", () => {
    for (let z = MIN_CALENDAR_ZOOM; z <= MAX_CALENDAR_ZOOM; z += 0.07) {
      expect(Number.isInteger(hourHeightFor(z))).toBe(true);
    }
  });

  it("never collapses the grid", () => {
    expect(hourHeightFor(0)).toBe(Math.round(BASE_HOUR_HEIGHT * MIN_CALENDAR_ZOOM));
  });
});

describe("zoomFromPinch", () => {
  it("scales with the distance between the fingers", () => {
    expect(zoomFromPinch(1, 100, 200)).toBe(2);
    expect(zoomFromPinch(2, 200, 100)).toBe(1);
  });

  it("stays put when the fingers have not moved", () => {
    expect(zoomFromPinch(1.4, 150, 150)).toBeCloseTo(1.4);
  });

  it("ignores a degenerate pinch instead of returning Infinity", () => {
    expect(zoomFromPinch(1.2, 0, 140)).toBeCloseTo(1.2);
    expect(zoomFromPinch(1.2, 140, 0)).toBeCloseTo(1.2);
  });
});

describe("steppedZoom", () => {
  it("steps in and out", () => {
    expect(steppedZoom(1, 1)).toBeCloseTo(1.25);
    expect(steppedZoom(1, -1)).toBeCloseTo(0.75);
  });

  it("stops at the ends rather than running past them", () => {
    expect(steppedZoom(MAX_CALENDAR_ZOOM, 1)).toBe(MAX_CALENDAR_ZOOM);
    expect(steppedZoom(MIN_CALENDAR_ZOOM, -1)).toBe(MIN_CALENDAR_ZOOM);
  });
});

describe("anchoredScrollTop", () => {
  it("keeps the time under the fingers where it was", () => {
    // 9am sits 144px down at 72px/hour (grid starts at 7am), and the
    // pinch centre is 100px into the viewport, so scrollTop is 44.
    const next = anchoredScrollTop({
      scrollTop: 44,
      anchorOffsetY: 100,
      fromHourHeight: 72,
      toHourHeight: 144,
    });
    // At 144px/hour that same 9am is 288px down, so it stays at 100.
    expect(next + 100).toBe(288);
  });

  it("never scrolls above the top of the day", () => {
    expect(
      anchoredScrollTop({ scrollTop: 0, anchorOffsetY: 40, fromHourHeight: 144, toHourHeight: 43 }),
    ).toBe(0);
  });

  it("does not divide by a zero height", () => {
    expect(
      anchoredScrollTop({ scrollTop: 30, anchorOffsetY: 10, fromHourHeight: 0, toHourHeight: 72 }),
    ).toBe(30);
  });
});

describe("parseStoredZoom", () => {
  it("defaults to 1 for nothing, junk, or an empty string", () => {
    expect(parseStoredZoom(null)).toBe(1);
    expect(parseStoredZoom("")).toBe(1);
    expect(parseStoredZoom("wide")).toBe(1);
  });

  it("clamps a stored value that is out of range", () => {
    expect(parseStoredZoom("99")).toBe(MAX_CALENDAR_ZOOM);
    expect(parseStoredZoom("1.5")).toBe(1.5);
  });
});
