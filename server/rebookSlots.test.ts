import { describe, it, expect } from "vitest";
import {
  slotsAroundTarget,
  describeNoSlotReason,
  DEFAULT_MAX_ALTERNATIVES,
  type DaySlots,
} from "@shared/rebookSlots";
import type { DayAvailability } from "@shared/nextAvailableSlot";

/** 9:00, 9:30 … 16:30 — the same half-hourly grid the staff dialog uses. */
const STARTS = Array.from({ length: 16 }, (_, i) => 9 * 60 + i * 30);

const day = (dateKey: string, over: Partial<DayAvailability> = {}): DayAvailability => ({
  dateKey,
  busy: [],
  booked: 0,
  capacity: null,
  ...over,
});

/** A fortnight of open days, 2026-11-09 onwards. */
const fortnight = Array.from({ length: 14 }, (_, i) =>
  day(`2026-11-${String(9 + i).padStart(2, "0")}`));

const opts = (over: Record<string, unknown> = {}) => ({
  durationMinutes: 60,
  slotStartsFor: () => STARTS,
  ...over,
});

const times = (d: DaySlots | undefined) =>
  (d?.slots ?? []).map((m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);

describe("slotsAroundTarget", () => {
  it("offers the free times on the day they jumped to", () => {
    const result = slotsAroundTarget(fortnight, "2026-11-16", opts());
    expect(result.target.reason).toBeNull();
    // A 60-minute groom cannot start at 17:30 and be done by 18:00's
    // close, so the last offered start is 17:00 — and the grid stops
    // at 16:30 anyway.
    expect(times(result.target)[0]).toBe("9:00");
    expect(result.target.slots).toHaveLength(STARTS.length);
  });

  it("leaves out times a booking already fills", () => {
    const days = fortnight.map((d) =>
      d.dateKey === "2026-11-16"
        ? day(d.dateKey, { busy: [{ startMinutes: 9 * 60, endMinutes: 11 * 60, kind: "appointment", label: "Milo" }] })
        : d);
    const result = slotsAroundTarget(days, "2026-11-16", opts());
    expect(times(result.target)).not.toContain("9:00");
    expect(times(result.target)).not.toContain("10:30");
    expect(times(result.target)).toContain("11:00");
  });

  it("says the salon is shut rather than just showing nothing", () => {
    const days = fortnight.map((d) =>
      d.dateKey === "2026-11-16" ? day(d.dateKey, { closed: true }) : d);
    const result = slotsAroundTarget(days, "2026-11-16", opts());
    expect(result.target.slots).toEqual([]);
    expect(result.target.reason).toBe("closed");
    expect(describeNoSlotReason("closed")).toBe("The salon is closed that day.");
  });

  it("distinguishes a full day from a day with no long enough gap", () => {
    const full = fortnight.map((d) =>
      d.dateKey === "2026-11-16" ? day(d.dateKey, { capacity: 8, booked: 8 }) : d);
    expect(slotsAroundTarget(full, "2026-11-16", opts()).target.reason).toBe("atCapacity");

    // Open, room on the day, but leave covers every hour of it.
    const blocked = fortnight.map((d) =>
      d.dateKey === "2026-11-16"
        ? day(d.dateKey, { busy: [{ startMinutes: 0, endMinutes: 24 * 60, kind: "blockout", label: "Leave" }] })
        : d);
    expect(slotsAroundTarget(blocked, "2026-11-16", opts()).target.reason).toBe("noGaps");
  });

  it("offers the nearest dates either side when the day is no good", () => {
    const days = fortnight.map((d) =>
      ["2026-11-15", "2026-11-16", "2026-11-17"].includes(d.dateKey)
        ? day(d.dateKey, { closed: true })
        : d);
    const result = slotsAroundTarget(days, "2026-11-16", opts());
    expect(result.target.slots).toEqual([]);
    // 14th and 18th are two days out, 13th and 19th three.
    expect(result.alternatives.map((a) => a.dateKey))
      .toEqual(["2026-11-14", "2026-11-18", "2026-11-13", "2026-11-19"]);
  });

  it("takes the nearer side first and the earlier date on a tie", () => {
    const days = fortnight.map((d) =>
      d.dateKey === "2026-11-16" ? day(d.dateKey, { closed: true }) : d);
    const result = slotsAroundTarget(days, "2026-11-16", opts());
    expect(result.alternatives[0]!.dateKey).toBe("2026-11-15");
    expect(result.alternatives[1]!.dateKey).toBe("2026-11-17");
  });

  it("still offers alternatives when the target itself has room", () => {
    // Staff may want a different day even when this one works.
    const result = slotsAroundTarget(fortnight, "2026-11-16", opts());
    expect(result.alternatives).toHaveLength(DEFAULT_MAX_ALTERNATIVES);
  });

  it("will not wander far from the mark they asked about", () => {
    const days = fortnight.map((d, i) => (i < 13 ? day(d.dateKey, { closed: true }) : d));
    const result = slotsAroundTarget(days, "2026-11-09", opts({ maxDistanceDays: 3 }));
    expect(result.alternatives).toEqual([]);
  });

  it("says so when asked about a day it was not given", () => {
    const result = slotsAroundTarget(fortnight, "2027-01-01", opts());
    expect(result.target.reason).toBe("unknown");
    expect(result.alternatives).toEqual([]);
    expect(describeNoSlotReason("unknown")).toMatch(/outside the dates/);
  });

  it("never offers a time that has already passed today", () => {
    const result = slotsAroundTarget(fortnight, "2026-11-09", opts({
      todayKey: "2026-11-09",
      nowMinutes: 13 * 60,
    }));
    expect(times(result.target)).not.toContain("9:00");
    expect(times(result.target)[0]).toBe("13:00");
  });
});
