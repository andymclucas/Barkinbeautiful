import { describe, it, expect } from "vitest";
import {
  buildTimeSlots,
  formatSlotLabel,
  joinLocalDateTime,
  minutesToTimeValue,
  splitLocalDateTime,
  timeValueToMinutes,
  STAFF_BOOKING_OPEN_MINUTES,
  STAFF_BOOKING_CLOSE_MINUTES,
  SALON_FIRST_BOOKING_MINUTES,
  SALON_LAST_BOOKING_MINUTES,
  salonBookingStarts,
} from "@shared/bookingTimeSlots";

describe("formatSlotLabel", () => {
  it("reads the way the salon says the time", () => {
    expect(formatSlotLabel(7 * 60)).toBe("7:00 am");
    expect(formatSlotLabel(9 * 60 + 30)).toBe("9:30 am");
    expect(formatSlotLabel(13 * 60)).toBe("1:00 pm");
    expect(formatSlotLabel(17 * 60 + 30)).toBe("5:30 pm");
  });

  it("calls noon and midnight 12, not 0", () => {
    expect(formatSlotLabel(12 * 60)).toBe("12:00 pm");
    expect(formatSlotLabel(0)).toBe("12:00 am");
  });
});

describe("time value round trip", () => {
  it("converts both ways", () => {
    expect(minutesToTimeValue(570)).toBe("09:30");
    expect(timeValueToMinutes("09:30")).toBe(570);
    expect(timeValueToMinutes("9:30")).toBe(570);
  });

  it("rejects what is not a time", () => {
    expect(timeValueToMinutes("")).toBeNull();
    expect(timeValueToMinutes(null)).toBeNull();
    expect(timeValueToMinutes("half past nine")).toBeNull();
    expect(timeValueToMinutes("25:00")).toBeNull();
    expect(timeValueToMinutes("09:70")).toBeNull();
  });
});

describe("buildTimeSlots", () => {
  it("steps in half hours across the staff window", () => {
    const slots = buildTimeSlots();
    expect(slots[0]).toEqual({ value: "07:00", label: "7:00 am" });
    expect(slots[1]).toEqual({ value: "07:30", label: "7:30 am" });
    expect(slots[slots.length - 1]).toEqual({
      value: "18:00",
      label: "6:00 pm",
    });
    // 07:00 to 18:00 inclusive, every 30 minutes.
    expect(slots).toHaveLength(
      (STAFF_BOOKING_CLOSE_MINUTES - STAFF_BOOKING_OPEN_MINUTES) / 30 + 1
    );
  });

  it("opens an hour before and closes an hour after public online booking", () => {
    // Online booking is 08:00–17:00. Early drop-offs and a late collection
    // are routine and a dropdown that cannot express them is useless.
    expect(STAFF_BOOKING_OPEN_MINUTES).toBe(7 * 60);
    expect(STAFF_BOOKING_CLOSE_MINUTES).toBe(18 * 60);
  });

  it("keeps an off-grid time rather than snapping it", () => {
    // Opening an existing 09:15 booking must not silently move it to 09:30.
    const slots = buildTimeSlots({ include: "09:15" });
    const values = slots.map(s => s.value);
    expect(values).toContain("09:15");
    expect(values.indexOf("09:15")).toBe(values.indexOf("09:00") + 1);
  });

  it("does not duplicate a time already on the grid", () => {
    const values = buildTimeSlots({ include: "09:30" }).map(s => s.value);
    expect(values.filter(v => v === "09:30")).toHaveLength(1);
  });

  it("ignores an unparseable include", () => {
    expect(buildTimeSlots({ include: "nonsense" })).toEqual(buildTimeSlots());
  });

  it("never loops forever on a zero step", () => {
    expect(buildTimeSlots({ stepMinutes: 0 })).toEqual([]);
  });
});

describe("splitLocalDateTime / joinLocalDateTime", () => {
  it("splits the shape the dialog already uses", () => {
    expect(splitLocalDateTime("2026-11-18T11:30")).toEqual({
      date: "2026-11-18",
      time: "11:30",
    });
  });

  it("tolerates seconds on the end", () => {
    expect(splitLocalDateTime("2026-11-18T11:30:00")).toEqual({
      date: "2026-11-18",
      time: "11:30",
    });
  });

  it("gives empty halves for nothing usable, not Invalid Date", () => {
    expect(splitLocalDateTime("")).toEqual({ date: "", time: "" });
    expect(splitLocalDateTime(null)).toEqual({ date: "", time: "" });
    expect(splitLocalDateTime("18/11/2026")).toEqual({ date: "", time: "" });
  });

  it("round trips", () => {
    const value = "2026-11-18T11:30";
    const { date, time } = splitLocalDateTime(value);
    expect(joinLocalDateTime(date, time)).toBe(value);
  });

  it("refuses to build a half a booking", () => {
    // A date with no time is not a start, and "2026-11-18T" would be stored
    // as an invalid one.
    expect(joinLocalDateTime("2026-11-18", "")).toBe("");
    expect(joinLocalDateTime("", "11:30")).toBe("");
    expect(joinLocalDateTime("2026-11-18", "nonsense")).toBe("");
  });

  it("pads a single-digit hour so the value stays sortable", () => {
    expect(joinLocalDateTime("2026-11-18", "9:05")).toBe("2026-11-18T09:05");
  });

  it("does no timezone arithmetic", () => {
    // The string is wall-clock; the server turns it into an instant with
    // parseBrisbaneLocalDateTime. Building a Date here would read it in the
    // browser's zone and land an hour out — the bug e6a4662 fixed.
    const value = "2026-06-30T23:30";
    const { date, time } = splitLocalDateTime(value);
    expect(joinLocalDateTime(date, time)).toBe(value);
  });
});

describe("the hours the app may OFFER", () => {
  const starts = salonBookingStarts();
  const labels = starts.map(formatSlotLabel);

  it("starts at 7:30, because that is when the first dogs come in", () => {
    // Lauren, 10/11/2026, with Next available showing 7am slots: "can we
    // adjust the times to our work hours, first dogs 7:30, last booking
    // come in at 1pm."
    expect(labels[0]).toBe("7:30 am");
    expect(labels).not.toContain("7:00 am");
  });

  it("ends at 1pm, and 1pm is a booking rather than the cut-off", () => {
    expect(labels[labels.length - 1]).toBe("1:00 pm");
    expect(labels).not.toContain("1:30 pm");
  });

  it("is every half hour in between, and nothing else", () => {
    expect(labels).toEqual([
      "7:30 am",
      "8:00 am",
      "8:30 am",
      "9:00 am",
      "9:30 am",
      "10:00 am",
      "10:30 am",
      "11:00 am",
      "11:30 am",
      "12:00 pm",
      "12:30 pm",
      "1:00 pm",
    ]);
  });

  it("sits inside the dropdown staff type into, never outside it", () => {
    /*
     * The two are different on purpose, and only in one direction. The
     * dropdown is WIDER: the diary holds 31 bookings at 13:30 and 10 at
     * 14:00 in the last six months, so narrowing it would make those
     * impossible to record. What must never happen is the reverse — an
     * offered time the dropdown cannot express would suggest a slot that
     * then cannot be saved.
     */
    const dropdown = buildTimeSlots().map(slot =>
      timeValueToMinutes(slot.value)
    );
    for (const start of starts) expect(dropdown).toContain(start);
    expect(SALON_FIRST_BOOKING_MINUTES).toBeGreaterThanOrEqual(
      STAFF_BOOKING_OPEN_MINUTES
    );
    expect(SALON_LAST_BOOKING_MINUTES).toBeLessThanOrEqual(
      STAFF_BOOKING_CLOSE_MINUTES
    );
  });

  it("is a closed window, not an open-ended one", () => {
    // A zero or negative step would otherwise loop for ever.
    expect(salonBookingStarts(0)).toEqual([]);
    expect(salonBookingStarts(-30)).toEqual([]);
  });
});
