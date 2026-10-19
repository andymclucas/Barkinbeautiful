import { describe, it, expect } from "vitest";
import {
  intervalsOverlap, clashesFor, annotateSlots, clashWarning, describeClash, shortTime,
  type BusyInterval,
} from "@shared/groomerAvailability";
import { buildTimeSlots, timeValueToMinutes } from "@shared/bookingTimeSlots";

const appt = (startMinutes: number, endMinutes: number, label = "Buddy (Smith)"): BusyInterval =>
  ({ startMinutes, endMinutes, kind: "appointment", label });
const leave = (startMinutes: number, endMinutes: number, label = "Annual leave"): BusyInterval =>
  ({ startMinutes, endMinutes, kind: "blockout", label });

describe("intervalsOverlap", () => {
  it("does not treat back-to-back bookings as a clash", () => {
    // The salon books like this all day. If 10:00-11:00 clashed with
    // 11:00-12:00 every second slot would warn and staff would stop reading.
    expect(intervalsOverlap(600, 660, 660, 720)).toBe(false);
    expect(intervalsOverlap(660, 720, 600, 660)).toBe(false);
  });

  it("catches a partial overlap from either side", () => {
    expect(intervalsOverlap(600, 700, 650, 750)).toBe(true);
    expect(intervalsOverlap(650, 750, 600, 700)).toBe(true);
  });

  it("catches one booking swallowing another", () => {
    expect(intervalsOverlap(600, 800, 650, 700)).toBe(true);
    expect(intervalsOverlap(650, 700, 600, 800)).toBe(true);
  });
});

describe("clashesFor", () => {
  const day = [appt(600, 780, "Link (Mastiff X)"), leave(840, 1080)];

  it("finds the groom a long booking runs into", () => {
    // 10:30am Giant groom, three hours: straight over Link.
    expect(clashesFor(630, 810, day).map((c) => c.label)).toEqual(["Link (Mastiff X)"]);
  });

  it("finds nothing in the gap between the two", () => {
    expect(clashesFor(780, 840, day)).toEqual([]);
  });

  it("returns clashes earliest first", () => {
    const found = clashesFor(540, 1200, day);
    expect(found.map((c) => c.startMinutes)).toEqual([600, 840]);
  });

  it("treats a zero-length booking as hitting nothing", () => {
    expect(clashesFor(650, 650, day)).toEqual([]);
    expect(clashesFor(650, 600, day)).toEqual([]);
  });
});

describe("annotateSlots", () => {
  const slots = buildTimeSlots();

  it("marks only the slots a booking of this length would hit", () => {
    const busy = [appt(600, 660)]; // 10:00-11:00
    const marked = annotateSlots(slots, busy, 30, timeValueToMinutes);
    const byValue = Object.fromEntries(marked.map((s) => [s.value, s.busy]));
    expect(byValue["09:30"]).toBe(false); // ends exactly at 10:00
    expect(byValue["10:00"]).toBe(true);
    expect(byValue["10:30"]).toBe(true);
    expect(byValue["11:00"]).toBe(false); // starts exactly at 11:00
  });

  it("marks more slots for a longer groom at the same time", () => {
    const busy = [appt(600, 660)];
    const short = annotateSlots(slots, busy, 30, timeValueToMinutes).filter((s) => s.busy);
    const long = annotateSlots(slots, busy, 180, timeValueToMinutes).filter((s) => s.busy);
    expect(long.length).toBeGreaterThan(short.length);
    // A 3h groom starting at 08:00 still runs into a 10:00 appointment.
    expect(long.some((s) => s.value === "08:00")).toBe(true);
    expect(short.some((s) => s.value === "08:00")).toBe(false);
  });

  it("marks nothing when the groomer's day is empty", () => {
    expect(annotateSlots(slots, [], 60, timeValueToMinutes).every((s) => !s.busy)).toBe(true);
  });

  it("still marks something when the duration is unknown", () => {
    const marked = annotateSlots(slots, [appt(600, 660)], 0, timeValueToMinutes);
    expect(marked.find((s) => s.value === "10:00")?.busy).toBe(true);
  });
});

describe("clashWarning", () => {
  it("says nothing when the slot is free", () => {
    expect(clashWarning([], "Charlotte")).toBeNull();
  });

  it("names the groomer and the dog in the way", () => {
    const msg = clashWarning([appt(600, 780, "Link (Mastiff X)")], "Charlotte");
    expect(msg).toBe("Charlotte already has 10am–1pm Link (Mastiff X) booked at that time.");
  });

  it("says leave differently from a dog, because it is a different decision", () => {
    const msg = clashWarning([leave(540, 1020, "Annual leave")], "Megs");
    expect(msg).toContain("is not working then");
    expect(msg).not.toContain("booked at that time");
  });

  it("counts them when there are several", () => {
    const msg = clashWarning([appt(600, 660, "A"), appt(630, 700, "B")], "Megs");
    expect(msg).toContain("2 things booked");
  });

  it("trims a long list rather than printing all of it", () => {
    const many = [appt(600, 610, "A"), appt(610, 620, "B"), appt(620, 630, "C"), appt(630, 640, "D")];
    const msg = clashWarning(many, "Megs") ?? "";
    expect(msg).toContain("and 1 more");
  });

  it("falls back when the groomer has no name", () => {
    expect(clashWarning([appt(600, 660)], "  ")).toContain("This groomer");
  });
});

describe("shortTime / describeClash", () => {
  it("drops :00 and reads midday as 12", () => {
    expect(shortTime(600)).toBe("10am");
    expect(shortTime(630)).toBe("10:30am");
    expect(shortTime(720)).toBe("12pm");
    expect(shortTime(0)).toBe("12am");
    expect(shortTime(780)).toBe("1pm");
  });

  it("reads as a span", () => {
    expect(describeClash(appt(600, 780, "Link"))).toBe("10am–1pm Link");
  });

  it("names a full day instead of printing 12am to 12am", () => {
    // A full-day blockout is stored 0..1440 and both ends format as 12am,
    // so Megs' annual leave read "12am–12am Annual leave".
    expect(describeClash(leave(0, 1440, "Annual leave"))).toBe("Annual leave (all day)");
    expect(clashWarning([leave(0, 1440, "Annual leave")], "Megs"))
      .toBe("Megs is not working then — Annual leave (all day).");
  });

  it("still gives a span for a part-day blockout", () => {
    expect(describeClash(leave(540, 720, "Dentist"))).toBe("9am–12pm Dentist");
  });
});
