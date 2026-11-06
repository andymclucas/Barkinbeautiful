import { describe, it, expect } from "vitest";
import {
  firstFreeSlot, dayIsBookable, describeNoSlot, nextFreeSlots, summariseSearch,
  tradingWeekdays, DEFAULT_SLOTS_PER_DAY,
  type DayAvailability,
} from "../shared/nextAvailableSlot";
import type { BusyInterval } from "../shared/groomerAvailability";

const appt = (startMinutes: number, endMinutes: number, label = "Buddy (Smith)"): BusyInterval =>
  ({ startMinutes, endMinutes, kind: "appointment", label });
const leave = (startMinutes: number, endMinutes: number): BusyInterval =>
  ({ startMinutes, endMinutes, kind: "blockout", label: "Annual leave" });

const day = (over: Partial<DayAvailability> = {}): DayAvailability =>
  ({ dateKey: "2026-11-03", busy: [], booked: 0, capacity: 8, ...over });

/** Half-hourly 7am to 6pm, the staff dialog's own grid. */
const halfHours = () => {
  const out: number[] = [];
  for (let m = 7 * 60; m <= 18 * 60; m += 30) out.push(m);
  return out;
};
const opts = (over: Partial<Parameters<typeof firstFreeSlot>[1]> = {}) =>
  ({ durationMinutes: 60, slotStartsFor: halfHours, ...over });

describe("dayIsBookable", () => {
  it("takes a day with room", () => {
    expect(dayIsBookable(day({ booked: 3, capacity: 8 }))).toEqual({ ok: true });
  });

  /** The gap the board could not see: 2pm looks empty, the day is spent. */
  it("refuses a groomer who is already at capacity", () => {
    expect(dayIsBookable(day({ booked: 8, capacity: 8 }))).toEqual({ ok: false, reason: "atCapacity" });
    expect(dayIsBookable(day({ booked: 9, capacity: 8 }))).toEqual({ ok: false, reason: "atCapacity" });
  });

  it("refuses a closed day", () => {
    expect(dayIsBookable(day({ closed: true }))).toEqual({ ok: false, reason: "closed" });
  });

  /** A bather carries no clip capacity and must not read as full. */
  it("does not cap somebody who has no clip capacity", () => {
    expect(dayIsBookable(day({ booked: 40, capacity: null }))).toEqual({ ok: true });
  });
});

describe("firstFreeSlot", () => {
  it("takes the first slot of an empty day", () => {
    expect(firstFreeSlot([day()], opts())).toEqual({ dateKey: "2026-11-03", startMinutes: 7 * 60, daysAhead: 0 });
  });

  it("steps past a booked morning", () => {
    const d = day({ busy: [appt(7 * 60, 9 * 60), appt(9 * 60, 10 * 60)] });
    expect(firstFreeSlot([d], opts())?.startMinutes).toBe(10 * 60);
  });

  /** Back-to-back is the normal case: a 10:00 start after a 10:00 finish. */
  it("allows a start exactly when the last dog finishes", () => {
    const d = day({ busy: [appt(7 * 60, 10 * 60)] });
    expect(firstFreeSlot([d], opts())?.startMinutes).toBe(10 * 60);
  });

  it("will not start something that would still be running at closing", () => {
    const d = day({ busy: [appt(7 * 60, 17 * 60 + 30)] });
    expect(firstFreeSlot([d], opts({ durationMinutes: 60 }))).toBeNull();
  });

  it("rolls on to the next day when today has no gap", () => {
    const full = day({ dateKey: "2026-11-03", busy: [appt(7 * 60, 18 * 60)] });
    const next = day({ dateKey: "2026-11-04" });
    expect(firstFreeSlot([full, next], opts())).toEqual({ dateKey: "2026-11-04", startMinutes: 7 * 60, daysAhead: 1 });
  });

  /** Capacity is a whole-day fact — the empty afternoon is not offered. */
  it("skips a day the groomer is full on, however empty it looks", () => {
    const spent = day({ dateKey: "2026-11-03", booked: 8, capacity: 8 });
    const next = day({ dateKey: "2026-11-04" });
    expect(firstFreeSlot([spent, next], opts())?.dateKey).toBe("2026-11-04");
  });

  it("skips a day off", () => {
    const off = day({ dateKey: "2026-11-03", closed: true });
    expect(firstFreeSlot([off, day({ dateKey: "2026-11-04" })], opts())?.dateKey).toBe("2026-11-04");
  });

  it("treats leave as blocking even on a day with capacity left", () => {
    const d = day({ busy: [leave(7 * 60, 12 * 60)] });
    expect(firstFreeSlot([d], opts())?.startMinutes).toBe(12 * 60);
  });

  /** Offering 8am at 3pm would make the whole button untrustworthy. */
  it("does not offer a slot that has already started today", () => {
    const d = day({ dateKey: "2026-11-03" });
    const found = firstFreeSlot([d], opts({ todayKey: "2026-11-03", nowMinutes: 13 * 60 + 10 }));
    expect(found?.startMinutes).toBe(13 * 60 + 30);
  });

  it("does not apply that to a later day", () => {
    const found = firstFreeSlot(
      [day({ dateKey: "2026-11-03", closed: true }), day({ dateKey: "2026-11-04" })],
      opts({ todayKey: "2026-11-03", nowMinutes: 16 * 60 }));
    expect(found).toEqual({ dateKey: "2026-11-04", startMinutes: 7 * 60, daysAhead: 1 });
  });

  it("finds nothing rather than guessing when the duration is unknown", () => {
    expect(firstFreeSlot([day()], opts({ durationMinutes: 0 }))).toBeNull();
  });

  /**
   * A long groom needs a long gap. The hour between 9 and 10 takes a
   * 60-minute booking exactly — ends are exclusive, so finishing at 10
   * does not collide with a 10 o'clock start — but not a giant's 90.
   */
  it("needs a gap the whole booking fits in", () => {
    const d = day({ busy: [appt(7 * 60, 9 * 60), appt(10 * 60, 18 * 60)] });
    expect(firstFreeSlot([d], opts({ durationMinutes: 90 }))).toBeNull();
    expect(firstFreeSlot([d], opts({ durationMinutes: 60 }))?.startMinutes).toBe(9 * 60);
    expect(firstFreeSlot([d], opts({ durationMinutes: 30 }))?.startMinutes).toBe(9 * 60);
  });
});

describe("describeNoSlot", () => {
  it("says the diary is full when every day is", () => {
    expect(describeNoSlot([day({ booked: 8 }), day({ booked: 8 })])).toBe("Fully booked for the next 2 days.");
  });

  it("separates shut from full", () => {
    expect(describeNoSlot([day({ closed: true }), day({ booked: 8 })])).toBe("Nothing open in the next 2 days.");
  });

  it("says so when the days are open but the gaps are too short", () => {
    expect(describeNoSlot([day(), day()])).toBe("No gap long enough in the next 2 days.");
  });

  it("copes with being asked about nothing", () => {
    expect(describeNoSlot([])).toBe("No days to look at.");
  });
});

describe("tradingWeekdays", () => {
  /** The real shape over the eight weeks to 30/10/2026. */
  const BARKIN = { 0: 0, 1: 0, 2: 8, 3: 8, 4: 8, 5: 9, 6: 2 };  // Sun..Sat

  it("learns Tuesday to Friday and leaves Saturday out", () => {
    expect([...tradingWeekdays(BARKIN, 8)].sort()).toEqual([2, 3, 4, 5]);
  });

  /** Four dogs across two Saturdays is an exception, not an opening day. */
  it("does not count an occasional day as a trading day", () => {
    expect(tradingWeekdays(BARKIN, 8).has(6)).toBe(false);
  });

  it("picks up a day the salon starts opening", () => {
    expect(tradingWeekdays({ ...BARKIN, 6: 7 }, 8).has(6)).toBe(true);
  });

  /**
   * A brand-new salon has no history. Saying "closed every day" would
   * make the scheduler useless on day one, so it offers everything and
   * lets clashes and capacity do the work.
   */
  it("offers every day when there is no history to learn from", () => {
    expect(tradingWeekdays({}, 8).size).toBe(7);
    expect(tradingWeekdays({ 0: 0, 1: 0 }, 8).size).toBe(7);
  });

  it("copes with a single week of history", () => {
    expect([...tradingWeekdays({ 2: 1, 3: 1 }, 1)].sort()).toEqual([2, 3]);
  });
});

describe("answering 'when's your next available booking' on the phone", () => {
  /*
   * Lauren, 06/11/2026: "I have no fucking idea off the top of my head
   * unless I go through manually and check."
   *
   * firstFreeSlot answers a different question — it fills a date field
   * in a booking already being made, where one answer is right. On the
   * phone the client says "no, I work Tuesdays" and one answer leaves
   * you scrolling again.
   */
  const threeDays = (): DayAvailability[] => ([
    day({ dateKey: "2026-11-10" }),
    day({ dateKey: "2026-11-11" }),
    day({ dateKey: "2026-11-12" }),
  ]);

  it("gives several, soonest first, in diary order", () => {
    const found = nextFreeSlots(threeDays(), opts(), 5);
    expect(found).toHaveLength(5);
    // Soonest first, and never going backwards.
    const keys = found.map(f => `${f.dateKey} ${f.startMinutes}`);
    expect(keys).toEqual([...keys].sort());
    expect(found[0]!.dateKey).toBe("2026-11-10");
    expect(found[0]!.daysAhead).toBe(0);
  });

  it("spreads across days rather than listing one quiet morning", () => {
    /*
     * A free Thursday has eleven half-hours in it. Reading out eleven
     * times from one morning is one answer dressed up as eleven — the
     * client wants to hear another DAY.
     */
    const found = nextFreeSlots(threeDays(), opts(), 6);
    const byDay = new Map<string, number>();
    for (const slot of found) byDay.set(slot.dateKey, (byDay.get(slot.dateKey) ?? 0) + 1);
    expect(byDay.size).toBe(3);
    for (const count of byDay.values()) expect(count).toBeLessThanOrEqual(DEFAULT_SLOTS_PER_DAY);
  });

  it("skips a day the salon is shut, and one the groomer is full", () => {
    const days = [
      day({ dateKey: "2026-11-07", closed: true }),
      day({ dateKey: "2026-11-09", booked: 8, capacity: 8 }),
      day({ dateKey: "2026-11-10" }),
    ];
    const found = nextFreeSlots(days, opts(), 3);
    expect(found.every(f => f.dateKey === "2026-11-10")).toBe(true);
    // daysAhead still counts from the start of the search, so the panel
    // can say how far out it had to go.
    expect(found[0]!.daysAhead).toBe(2);
  });

  it("will not offer a slot that runs past closing", () => {
    // A three-hour groom at 4pm is not a slot, however empty 4pm looks.
    const found = nextFreeSlots([day()], opts({ durationMinutes: 180 }), 20);
    for (const slot of found) expect(slot.startMinutes + 180).toBeLessThanOrEqual(18 * 60);
  });

  it("respects leave the same way the single-slot search does", () => {
    const morningOff = day({ busy: [leave(7 * 60, 12 * 60)] });
    const found = nextFreeSlots([morningOff], opts(), 4);
    for (const slot of found) expect(slot.startMinutes).toBeGreaterThanOrEqual(12 * 60);
  });

  it("returns nothing rather than something wrong when nothing fits", () => {
    expect(nextFreeSlots([day({ closed: true })], opts(), 5)).toEqual([]);
    expect(nextFreeSlots([], opts(), 5)).toEqual([]);
    expect(nextFreeSlots([day()], opts(), 0)).toEqual([]);
  });

  it("agrees with firstFreeSlot about the first one", () => {
    // Two functions answering the same question differently is the drift
    // that put three copies of the staff route list out of step.
    const days = [day({ dateKey: "2026-11-10", busy: [appt(7 * 60, 10 * 60)] }), day({ dateKey: "2026-11-11" })];
    expect(nextFreeSlots(days, opts(), 1)[0]).toEqual(firstFreeSlot(days, opts()));
  });
});

describe("saying why the first free day is so far out", () => {
  it("counts the shut days and the full ones separately", () => {
    // "The 20th" means something different when the four days before it
    // were full than when the salon was shut.
    const days = [
      day({ dateKey: "2026-11-07", closed: true }),
      day({ dateKey: "2026-11-08", closed: true }),
      day({ dateKey: "2026-11-09", booked: 8, capacity: 8 }),
      day({ dateKey: "2026-11-10" }),
    ];
    expect(summariseSearch(days)).toEqual({ searched: 4, closed: 2, full: 1 });
  });

  it("counts nothing when everything is open", () => {
    expect(summariseSearch([day(), day()])).toEqual({ searched: 2, closed: 0, full: 0 });
  });
});
