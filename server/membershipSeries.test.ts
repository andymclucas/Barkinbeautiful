import { describe, it, expect } from "vitest";
import {
  brisbaneDayGap,
  describeSeriesPlan,
  occurrencesForMonths,
  planMembershipSeries,
  type BusyInterval,
} from "@shared/membershipSeries";
import { buildOnlineBookingSlotStarts } from "@shared/onlineBookingSlots";
import { brisbaneDateKey } from "@shared/localDateTime";

/**
 * The real slot grid, not a stub: 30-minute starts, 8am–5pm, and the salon
 * shut Saturday, Sunday and Monday. Using the real one is the point — if
 * those rules move, this series has to move with them.
 */
const slotsForDate = buildOnlineBookingSlotStarts;

/** Brisbane wall clock, the way a client picks a time. */
const bris = (local: string) => new Date(`${local}:00+10:00`);
const busy = (from: string, to: string): BusyInterval => ({ start: bris(from), end: bris(to) });

/** 9am on Tuesday 3 November 2026. Every later Tuesday is 5 weeks on. */
const FIRST = bris("2026-11-03T09:00");

const plan = (over: Partial<Parameters<typeof planMembershipSeries>[0]> = {}) =>
  planMembershipSeries({
    firstStart: FIRST,
    durationMinutes: 90,
    intervalWeeks: 5,
    occurrenceCount: 10,
    busy: [],
    slotsForDate,
    ...over,
  });

const dateKeys = (p: ReturnType<typeof plan>) =>
  p.occurrences.map((o) => (o.start ? brisbaneDateKey(o.start) : null));

describe("planMembershipSeries", () => {
  it("keeps a clean year on the day and time the client chose", () => {
    const result = plan();
    expect(result).toMatchObject({ placedCount: 10, shiftedCount: 0, unplacedCount: 0 });
    // Ten Tuesdays, five weeks apart, 9am each — a full year of a 5-weekly
    // membership, which is the case Julie Noy actually asked for.
    expect(dateKeys(result)).toEqual([
      "2026-11-03", "2026-12-08", "2027-01-12", "2027-02-16", "2027-03-23",
      "2027-04-27", "2027-06-01", "2027-07-06", "2027-08-10", "2027-09-14",
    ]);
    expect(result.occurrences.every((o) => o.start!.getTime() === o.idealStart.getTime())).toBe(true);
  });

  it("moves a clashing groom to the nearest free time, same day", () => {
    // The groomer is booked over the third visit's 9am.
    const result = plan({ busy: [busy("2027-01-12T09:00", "2027-01-12T10:30")] });

    expect(result.placedCount).toBe(10);
    expect(result.unplacedCount).toBe(0);
    expect(result.shiftedCount).toBe(1);

    const moved = result.occurrences[2];
    expect(brisbaneDateKey(moved.start!)).toBe("2027-01-12"); // same day
    expect(moved.shiftedDays).toBe(0);
    expect(moved.shiftedMinutes).toBe(90); // first free 30-min start after the clash
  });

  it("moves to the next open day when the whole day is gone", () => {
    // Annual leave: the groomer is out all of that Tuesday.
    const result = plan({ busy: [busy("2027-01-12T00:00", "2027-01-13T00:00")] });

    const moved = result.occurrences[2];
    expect(brisbaneDateKey(moved.start!)).toBe("2027-01-13"); // Wednesday
    expect(moved.shiftedDays).toBe(1);
    // Later before earlier at the same distance: pulling a groom forward can
    // land it inside the previous visit's interval.
    expect(moved.start!.getTime()).toBeGreaterThan(moved.idealStart.getTime());
  });

  it("does NOT let one shifted groom drag the rest off the client's weekday", () => {
    // This is the bug the ideal-anchored cadence exists to prevent: chaining
    // the next date off where the last one LANDED walks the whole year
    // forward a day at a time.
    const result = plan({ busy: [busy("2027-01-12T00:00", "2027-01-13T00:00")] });

    expect(dateKeys(result).slice(3)).toEqual([
      "2027-02-16", "2027-03-23", "2027-04-27",
      "2027-06-01", "2027-07-06", "2027-08-10", "2027-09-14",
    ]);
    expect(result.shiftedCount).toBe(1);
  });

  it("never books the series over itself", () => {
    // A one-week cadence with the first four Tuesdays' mornings gone forces
    // several occurrences to compete for the same handful of free slots.
    const result = planMembershipSeries({
      firstStart: FIRST,
      durationMinutes: 60,
      intervalWeeks: 1,
      occurrenceCount: 4,
      busy: [
        busy("2026-11-03T08:00", "2026-11-03T15:00"),
        busy("2026-11-10T08:00", "2026-11-10T15:00"),
      ],
      slotsForDate,
    });

    const starts = result.occurrences.filter((o) => o.start).map((o) => o.start!.getTime());
    expect(new Set(starts).size).toBe(starts.length);
    // And in order — a later visit never precedes an earlier one.
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it("reports a groom it could not place rather than dropping it", () => {
    // Everything within four days of the second visit is taken.
    const result = plan({
      occurrenceCount: 2,
      busy: [busy("2026-12-04T00:00", "2026-12-13T00:00")],
    });

    expect(result.placedCount).toBe(1);
    expect(result.unplacedCount).toBe(1);
    const stranded = result.occurrences[1];
    expect(stranded.start).toBeNull();
    // The ideal is still reported, so the salon knows what to arrange.
    expect(brisbaneDateKey(stranded.idealStart)).toBe("2026-12-08");
  });

  it("never pulls the first groom earlier than the slot the client picked", () => {
    // The search looks both ways. Without a floor at the chosen start, a
    // busy Tuesday sends the FIRST visit back to the previous Friday —
    // a date that may already have passed by the time they confirm.
    const result = plan({
      occurrenceCount: 1,
      busy: [busy("2026-11-03T08:00", "2026-11-04T00:00")],
    });

    const first = result.occurrences[0];
    expect(first.start!.getTime()).toBeGreaterThanOrEqual(FIRST.getTime());
    expect(brisbaneDateKey(first.start!)).toBe("2026-11-04");
  });

  it("returns nothing for a cadence that cannot run", () => {
    expect(plan({ occurrenceCount: 0 }).occurrences).toEqual([]);
    expect(plan({ intervalWeeks: 0 }).occurrences).toEqual([]);
    expect(plan({ durationMinutes: 0 }).occurrences).toEqual([]);
  });

  it("skips the days the salon is shut without counting them as clashes", () => {
    // A Friday start at 4-weekly stays on Fridays; nothing lands on the
    // Saturday/Sunday/Monday the slot builder refuses to open.
    const result = planMembershipSeries({
      firstStart: bris("2026-11-06T10:00"),
      durationMinutes: 60,
      intervalWeeks: 4,
      occurrenceCount: 6,
      busy: [],
      slotsForDate,
    });
    expect(result.shiftedCount).toBe(0);
    for (const occurrence of result.occurrences) {
      const weekday = new Date(brisbaneDateKey(occurrence.start!) + "T00:00:00Z").getUTCDay();
      expect([2, 3, 4, 5]).toContain(weekday);
    }
  });
});

describe("brisbaneDayGap", () => {
  it("counts calendar days, not elapsed hours", () => {
    // 15 hours apart, but plainly the next day — differencing timestamps
    // and flooring gives 0, which would report a moved groom as unmoved.
    expect(brisbaneDayGap(bris("2026-11-03T17:00"), bris("2026-11-04T08:00"))).toBe(1);
    expect(brisbaneDayGap(bris("2026-11-03T08:00"), bris("2026-11-03T17:00"))).toBe(0);
    expect(brisbaneDayGap(bris("2026-11-04T08:00"), bris("2026-11-03T17:00"))).toBe(-1);
  });

  it("is right either side of UTC midnight", () => {
    // Brisbane 9am is 23:00 UTC the day before. A UTC-based day count
    // reads these two as different days when they are the same one.
    expect(brisbaneDayGap(bris("2026-11-03T09:00"), bris("2026-11-03T11:00"))).toBe(0);
  });
});

describe("occurrencesForMonths", () => {
  it("floors to whole grooms", () => {
    expect(occurrencesForMonths(5, 12)).toBe(10); // 52/5 = 10.4
    expect(occurrencesForMonths(4, 12)).toBe(13);
    expect(occurrencesForMonths(2, 12)).toBe(26);
    expect(occurrencesForMonths(8, 12)).toBe(6);  // 6.5
    expect(occurrencesForMonths(6, 6)).toBe(4);   // half a year at 6-weekly
  });

  it("always offers at least the first groom", () => {
    // A 26-weekly plan over 3 months is under one visit; booking none of
    // them would sign a client up to a membership with no appointment.
    expect(occurrencesForMonths(26, 3)).toBe(1);
  });

  it("refuses nonsense rather than guessing", () => {
    expect(occurrencesForMonths(0, 12)).toBe(0);
    expect(occurrencesForMonths(5, 0)).toBe(0);
    expect(occurrencesForMonths(Number.NaN, 12)).toBe(0);
  });
});

describe("describeSeriesPlan", () => {
  it("tells the client what they are actually getting", () => {
    expect(describeSeriesPlan(plan())).toBe("10 grooms booked.");
    expect(describeSeriesPlan(plan({ busy: [busy("2027-01-12T09:00", "2027-01-12T10:30")] })))
      .toBe("10 grooms booked, 1 moved to the nearest free time.");
    expect(describeSeriesPlan(plan({ occurrenceCount: 2, busy: [busy("2026-12-04T00:00", "2026-12-13T00:00")] })))
      .toBe("1 groom booked, 1 the salon will arrange with you.");
  });

  it("does not claim a booking when nothing could be placed", () => {
    expect(describeSeriesPlan(plan({ occurrenceCount: 1, busy: [busy("2026-11-03T00:00", "2026-11-09T00:00")] })))
      .toBe("No appointments could be booked at that time.");
  });
});
