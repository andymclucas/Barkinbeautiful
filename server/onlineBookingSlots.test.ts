import { describe, expect, it } from "vitest";
import {
  ONLINE_BOOKING_SLOT_INTERVAL_MINUTES,
  buildOnlineBookingSlotStarts,
  isOfferedOnlineStart,
} from "../shared/onlineBookingSlots";
import { SALON_LAST_BOOKING_MINUTES } from "../shared/bookingTimeSlots";

const brisbaneTime = (d: Date) =>
  d.toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane", hour: "2-digit", minute: "2-digit", hour12: false });

describe("online booking slot candidates", () => {
  it("builds half-hour AEST starts from 8am to the 1pm last drop-off", () => {
    const slots = buildOnlineBookingSlotStarts("2026-08-11", 120);
    // 8:00 to 13:00 is eleven half-hours, less 10:00 and 10:30.
    expect(slots).toHaveLength(9);
    expect(slots[0]?.toISOString()).toBe("2026-08-10T22:00:00.000Z");
    expect(slots.at(-1)?.toISOString()).toBe("2026-08-11T03:00:00.000Z"); // 1pm
    expect(slots[1]!.getTime() - slots[0]!.getTime()).toBe(ONLINE_BOOKING_SLOT_INTERVAL_MINUTES * 60_000);
  });

  it("does not offer a start when the selected service cannot finish in booking hours", () => {
    expect(buildOnlineBookingSlotStarts("2026-08-11", 600)).toEqual([]);
  });

  it("offers no slots on Saturday, Sunday or Monday \u2014 the salon is closed", () => {
    expect(buildOnlineBookingSlotStarts("2026-08-08", 60)).toEqual([]); // Saturday
    expect(buildOnlineBookingSlotStarts("2026-08-09", 60)).toEqual([]); // Sunday
    expect(buildOnlineBookingSlotStarts("2026-08-10", 60)).toEqual([]); // Monday
  });

  it("still offers slots on the days the salon is open", () => {
    expect(buildOnlineBookingSlotStarts("2026-08-11", 60).length).toBeGreaterThan(0); // Tuesday
    expect(buildOnlineBookingSlotStarts("2026-08-12", 60).length).toBeGreaterThan(0); // Wednesday
    expect(buildOnlineBookingSlotStarts("2026-08-13", 60).length).toBeGreaterThan(0); // Thursday
    expect(buildOnlineBookingSlotStarts("2026-08-14", 60).length).toBeGreaterThan(0); // Friday
  });

  it("leaves out the 9:30-11 mid-morning gap, keeping 9:30 and 11:00 themselves", () => {
    const brisbane = (d: Date) =>
      d.toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", minute: "2-digit", hour12: false });
    const times = buildOnlineBookingSlotStarts("2026-11-12", 60).map(brisbane);
    expect(times).toContain("09:30");
    expect(times).toContain("11:00");
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
  });

  it("offers nothing after 1pm, whatever the service length", () => {
    // Lauren: "last booking come in at 1pm". This used to run to 3pm for a
    // two-hour groom and 4pm for a one-hour one.
    for (const minutes of [30, 60, 90, 120]) {
      const times = buildOnlineBookingSlotStarts("2026-11-12", minutes).map(brisbaneTime);
      expect(times.at(-1)).toBe("13:00");
      expect(times).not.toContain("13:30");
    }
  });

  it("stops at the same time as the staff side", () => {
    expect(SALON_LAST_BOOKING_MINUTES).toBe(13 * 60);
  });

  it("still lets the 5pm close cut a long service earlier than 1pm", () => {
    // 600 minutes from 8am runs past 5pm, so there is no start at all.
    expect(buildOnlineBookingSlotStarts("2026-11-12", 600)).toEqual([]);
    // 300 minutes: the last start that finishes by 5pm is 12:00.
    expect(buildOnlineBookingSlotStarts("2026-11-12", 300).map(brisbaneTime).at(-1)).toBe("12:00");
  });
});

describe("isOfferedOnlineStart", () => {
  const at = (local: string) => new Date(`${local}:00+10:00`);

  it("accepts a time the list shows", () => {
    expect(isOfferedOnlineStart(at("2026-11-12T08:00"), 60)).toBe(true);
    expect(isOfferedOnlineStart(at("2026-11-12T13:00"), 60)).toBe(true);
  });

  it("refuses a time no list shows, posted directly", () => {
    expect(isOfferedOnlineStart(at("2026-11-12T14:00"), 60)).toBe(false); // after 1pm
    expect(isOfferedOnlineStart(at("2026-11-12T10:00"), 60)).toBe(false); // quiet window
    expect(isOfferedOnlineStart(at("2026-11-12T08:15"), 60)).toBe(false); // off the half hour
    expect(isOfferedOnlineStart(at("2026-11-14T09:00"), 60)).toBe(false); // Saturday
    expect(isOfferedOnlineStart(new Date("nonsense"), 60)).toBe(false);
  });

  it("reads the day in Brisbane, not UTC", () => {
    // 8am Thursday in Brisbane is 22:00 Wednesday UTC.
    expect(isOfferedOnlineStart(new Date("2026-11-11T22:00:00Z"), 60)).toBe(true);
  });
});
