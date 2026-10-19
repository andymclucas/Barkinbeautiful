import { describe, it, expect } from "vitest";
import {
  intervalsOverlap, clashesFor, annotateSlots, unavailableWarning, concurrentDogs,
  blockingClashes, describeClash, shortTime,
  busyFromRows,
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

describe("unavailableWarning", () => {
  it("says nothing when the groomer is simply working", () => {
    expect(unavailableWarning([], "Charlotte")).toBeNull();
  });

  it("does NOT warn about another dog at the same time", () => {
    // The rule this replaced warned on any overlap. Across the diary
    // there are 14,445 overlapping pairs against 12,728 appointments —
    // one dog in the bath, one drying, one being clipped is how the
    // salon runs, and a warning that always fires gets dismissed.
    expect(unavailableWarning([appt(600, 780, "Link (Mastiff X)")], "Charlotte")).toBeNull();
    expect(unavailableWarning([appt(600, 660, "A"), appt(630, 700, "B")], "Megs")).toBeNull();
  });

  it("warns about leave, which is never routine", () => {
    const msg = unavailableWarning([leave(540, 1020, "Annual leave")], "Megs");
    expect(msg).toBe("Megs is not working then — 9am–5pm Annual leave.");
  });

  it("picks the leave out of a mixed list and ignores the dogs", () => {
    const msg = unavailableWarning(
      [appt(600, 660, "Buddy"), leave(540, 1020, "Annual leave")], "Megs") ?? "";
    expect(msg).toContain("Annual leave");
    expect(msg).not.toContain("Buddy");
  });

  it("falls back when the groomer has no name", () => {
    expect(unavailableWarning([leave(0, 1440)], "  ")).toContain("This groomer");
  });
});

describe("concurrentDogs / blockingClashes", () => {
  it("counts the dogs already on, as context rather than a problem", () => {
    expect(concurrentDogs([appt(600, 660, "A"), appt(630, 700, "B"), leave(0, 1440)])).toBe(2);
    expect(concurrentDogs([])).toBe(0);
  });

  it("keeps only leave as something that blocks", () => {
    const out = blockingClashes([appt(600, 660, "A"), leave(0, 1440, "Leave")]);
    expect(out.map((c) => c.label)).toEqual(["Leave"]);
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
    expect(unavailableWarning([leave(0, 1440, "Annual leave")], "Megs"))
      .toBe("Megs is not working then — Annual leave (all day).");
  });

  it("still gives a span for a part-day blockout", () => {
    expect(describeClash(leave(540, 720, "Dentist"))).toBe("9am–12pm Dentist");
  });
});

describe("busyFromRows", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 1, startMinutes: 600, endMinutes: 660, label: "Buddy", ...over,
  });

  it("drops the appointment being moved, so it cannot clash with itself", () => {
    // Without this every reschedule warns, including nudging a booking
    // fifteen minutes, and staff learn to click through the warning.
    const rows = [row({ id: 7 }), row({ id: 8, startMinutes: 700, endMinutes: 760 })];
    expect(busyFromRows({ rows, excludeId: 7 }).map((b) => b.label)).toHaveLength(1);
    expect(busyFromRows({ rows, excludeId: null })).toHaveLength(2);
  });

  it("ignores a cancelled booking, which is not a commitment", () => {
    const rows = [row({ id: 1, cancelled: true }), row({ id: 2, startMinutes: 700, endMinutes: 760 })];
    expect(busyFromRows({ rows })).toHaveLength(1);
  });

  it("ignores a row with no duration", () => {
    expect(busyFromRows({ rows: [row({ endMinutes: 600 })] })).toEqual([]);
  });

  it("keeps blockouts as blockouts and defaults the rest to appointments", () => {
    const out = busyFromRows({ rows: [
      row({ id: 1, kind: "blockout", label: "Leave" }),
      row({ id: 2, startMinutes: 700, endMinutes: 760 }),
    ] });
    expect(out.map((b) => b.kind)).toEqual(["blockout", "appointment"]);
  });

  it("returns them in time order", () => {
    const out = busyFromRows({ rows: [
      row({ id: 1, startMinutes: 800, endMinutes: 860 }),
      row({ id: 2, startMinutes: 600, endMinutes: 660 }),
    ] });
    expect(out.map((b) => b.startMinutes)).toEqual([600, 800]);
  });
});
