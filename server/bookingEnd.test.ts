import { describe, it, expect } from "vitest";
import {
  resolveBookingEnd, isDaycareService, DEFAULT_BOOKING_MINUTES, DEFAULT_DAYCARE_END,
} from "../shared/bookingEnd";

const start = (h: number, m = 0) => {
  const d = new Date("2026-10-28T00:00:00");
  d.setHours(h, m, 0, 0);
  return d;
};

describe("isDaycareService", () => {
  it("knows day care from the rest", () => {
    expect(isDaycareService("daycare")).toBe(true);
    expect(isDaycareService("Daycare")).toBe(true);
    for (const s of ["classic_groom", "bath_only", "fft", null, undefined]) {
      expect(isDaycareService(s), String(s)).toBe(false);
    }
  });
});

describe("resolveBookingEnd", () => {
  /** Grooming keeps exactly what it had; this change is about day care. */
  it("leaves every other service on its ninety minutes", () => {
    const end = resolveBookingEnd({ start: start(9), serviceType: "classic_groom" })!;
    expect(end.getTime() - start(9).getTime()).toBe(DEFAULT_BOOKING_MINUTES * 60_000);
  });

  it("ignores an end time given for a groom", () => {
    const end = resolveBookingEnd({ start: start(9), serviceType: "bath_only", endTime: "16:00" })!;
    expect(end.getHours()).toBe(10);
    expect(end.getMinutes()).toBe(30);
  });

  /**
   * The bug this exists for. A dog dropped at nine was booked out at
   * half ten, and the day care board reads its "Out" straight off this.
   */
  it("uses the chosen pick-up time for day care", () => {
    const end = resolveBookingEnd({ start: start(9), serviceType: "daycare", endTime: "16:00" })!;
    expect(end.getHours()).toBe(16);
    expect(end.getMinutes()).toBe(0);
    expect(end.getDate()).toBe(start(9).getDate());
  });

  it("accepts a single-digit hour", () => {
    expect(resolveBookingEnd({ start: start(7), serviceType: "daycare", endTime: "9:30" })!.getHours()).toBe(9);
  });

  /**
   * Null rather than a quiet fallback: a pick-up before the drop-off is
   * a typo somebody needs to see, and stretching it to the next day
   * would put the dog on tomorrow's board.
   */
  it("refuses a pick-up at or before the drop-off", () => {
    expect(resolveBookingEnd({ start: start(9), serviceType: "daycare", endTime: "08:00" })).toBeNull();
    expect(resolveBookingEnd({ start: start(9), serviceType: "daycare", endTime: "09:00" })).toBeNull();
  });

  it("refuses a time that is not a time", () => {
    for (const bad of ["", null, undefined, "16", "4pm", "25:00", "16:70", "nonsense"]) {
      expect(resolveBookingEnd({ start: start(9), serviceType: "daycare", endTime: bad }), String(bad)).toBeNull();
    }
  });

  it("offers a default somebody can change", () => {
    expect(DEFAULT_DAYCARE_END).toBe("16:00");
    expect(resolveBookingEnd({ start: start(9), serviceType: "daycare", endTime: DEFAULT_DAYCARE_END })).not.toBeNull();
  });
});
