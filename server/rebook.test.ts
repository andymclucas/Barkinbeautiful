import { describe, expect, it } from "vitest";
import {
  addWeeks, DEFAULT_REBOOK_WEEKS, gapInWeeks, gapsBetween, manualInterval,
  rebookInterval, REBOOK_WEEK_CHOICES, rebookWeekOptions,
} from "@shared/rebook";

const d = (iso: string) => new Date(`${iso}T09:00:00+10:00`);

describe("addWeeks", () => {
  it("keeps the same weekday and the same clock time", () => {
    const from = d("2026-11-03"); // a Tuesday
    const to = addWeeks(from, 6);
    expect(to.toISOString()).toBe(new Date("2026-12-15T09:00:00+10:00").toISOString());
  });

  it("is exact across the whole year, because Brisbane has no DST", () => {
    // The same arithmetic in a DST zone would drift an hour here.
    const to = addWeeks(d("2026-03-31"), 8);
    expect(to.toISOString()).toBe(new Date("2026-05-26T09:00:00+10:00").toISOString());
  });
});

describe("rebookInterval", () => {
  it("trusts the membership above everything — it is what they pay for", () => {
    const r = rebookInterval({ membershipTierWeeks: 4, recentGapWeeks: [9, 9, 9] });
    expect(r.weeks).toBe(4);
    expect(r.source).toBe("membership");
    expect(r.reason).toMatch(/membership/);
  });

  it("reads the dog's own rhythm when there is no membership", () => {
    const r = rebookInterval({ recentGapWeeks: [7, 7, 8] });
    expect(r.weeks).toBe(7);
    expect(r.source).toBe("history");
    expect(r.reason).toMatch(/usually about every 7 weeks/);
  });

  /** One long gap over Christmas must not drag the rhythm out. */
  it("uses the median, so one outlier does not move it", () => {
    expect(rebookInterval({ recentGapWeeks: [6, 6, 6, 14] }).weeks).toBe(6);
  });

  it("will not read a rhythm from a single visit", () => {
    const r = rebookInterval({ recentGapWeeks: [7] });
    expect(r.source).toBe("default");
    expect(r.weeks).toBe(DEFAULT_REBOOK_WEEKS);
  });

  /** A year away is a lapsed client, not a cadence worth repeating. */
  it("ignores gaps too long to be a cadence", () => {
    const r = rebookInterval({ recentGapWeeks: [52, 40] });
    expect(r.source).toBe("default");
  });

  it("ignores gaps too short to be a groom cycle", () => {
    const r = rebookInterval({ recentGapWeeks: [1, 1, 1] });
    expect(r.source).toBe("default");
  });

  it("falls back to the house interval with nothing to go on", () => {
    const r = rebookInterval({});
    expect(r.weeks).toBe(DEFAULT_REBOOK_WEEKS);
    expect(r.reason).toMatch(/no pattern yet/);
  });

  it("ignores a membership interval of zero rather than booking today", () => {
    expect(rebookInterval({ membershipTierWeeks: 0 }).source).toBe("default");
  });
});

describe("reading a rhythm", () => {
  it("rounds, because a booking moved a day is the same cadence", () => {
    expect(gapInWeeks(d("2026-01-01"), d("2026-02-11"))).toBe(6); // 41 days
    expect(gapInWeeks(d("2026-01-01"), d("2026-02-13"))).toBe(6); // 43 days
  });

  it("returns gaps most recent first, whatever order it is given", () => {
    const gaps = gapsBetween([d("2026-01-01"), d("2026-04-23"), d("2026-02-12"), d("2026-03-19")]);
    // Jan 1 -> Feb 12 -> Mar 19 -> Apr 23 is 6, 5, 5; newest first.
    expect(gaps).toEqual([5, 5, 6]);
  });

  it("has nothing to say about a single visit", () => {
    expect(gapsBetween([d("2026-01-01")])).toEqual([]);
    expect(gapsBetween([])).toEqual([]);
  });
});

describe("rebookWeekOptions", () => {
  it("offers the same one-to-fourteen the calendar sidebar does", () => {
    // Lauren asked for "the quick jump option like there is on the main
    // calendar", so this is the same set rather than a tidier subset.
    const options = rebookWeekOptions(6);
    expect(options[0]).toBe(1);
    expect(options.at(-1)).toBe(14);
    expect(options).toHaveLength(14);
    expect(options).toEqual([...REBOOK_WEEK_CHOICES]);
  });

  it("keeps the odd intervals the calendar's REPEAT picker leaves out", () => {
    // That one is evens-only because it sets up a standing series. This
    // salon has dogs on three, five and seven weeks and rebookInterval
    // reads those straight off their history, so a button has to exist
    // for the number it is about to recommend.
    const options = rebookWeekOptions(6);
    for (const odd of [3, 5, 7]) expect(options).toContain(odd);
  });

  it("includes a recommendation that falls outside the standard run", () => {
    // A dog on a sixteen-week rhythm would otherwise get a button row with
    // nothing selected while the date box said sixteen weeks out, which
    // reads as a bug rather than as a recommendation.
    const options = rebookWeekOptions(16);
    expect(options).toContain(16);
    expect(options).toEqual([...options].sort((a, b) => a - b));
    expect(options.at(-1)).toBe(16);
  });

  it("does not duplicate a recommendation that is already standard", () => {
    const options = rebookWeekOptions(6);
    expect(options.filter((w) => w === 6)).toHaveLength(1);
  });

  it("rounds a fractional recommendation to a whole week", () => {
    // rebookInterval already rounds its median, but the chip list must not
    // depend on that staying true - a 4.5 would render as a "4.5w" button.
    expect(rebookWeekOptions(16.4)).toContain(16);
    expect(rebookWeekOptions(16.6)).toContain(17);
  });

  it("ignores a nonsense recommendation rather than drawing a chip for it", () => {
    for (const bad of [0, -3, NaN, Infinity]) {
      expect(rebookWeekOptions(bad)).toEqual([...REBOOK_WEEK_CHOICES]);
    }
  });
});

describe("manualInterval", () => {
  it("marks the choice as the staff member's, not the dog's history", () => {
    // The source is what lets the dialog keep showing the recommendation
    // beside an override instead of replacing it.
    expect(manualInterval(6)).toEqual({
      weeks: 6, source: "manual", reason: "set by hand to 6 weeks",
    });
  });

  it("reads correctly for a single week", () => {
    expect(manualInterval(1).reason).toBe("set by hand to 1 week");
  });
});
