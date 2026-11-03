import { describe, expect, it } from "vitest";
import { describeWeeks, visitRhythm } from "../shared/visitRhythm";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("visitRhythm", () => {
  it("measures the gap either side of this visit", () => {
    const r = visitRhythm({
      last: d("2026-09-23"), current: d("2026-11-04"), next: d("2026-12-16"),
    });
    expect(r.sinceLastWeeks).toBe(6);
    expect(r.untilNextWeeks).toBe(6);
    expect(r.settled).toBe(true);
  });

  /*
   * The case an average would have hidden. A dog that used to come
   * every 6 weeks and is next booked in 12 is the thing worth noticing
   * at the counter, and a mean of 9 says nothing useful about either.
   */
  it("does not call a dog settled when the two gaps disagree", () => {
    const r = visitRhythm({
      last: d("2026-09-23"), current: d("2026-11-04"), next: d("2027-01-27"),
    });
    expect(r.sinceLastWeeks).toBe(6);
    expect(r.untilNextWeeks).toBe(12);
    expect(r.settled).toBe(false);
  });

  it("copes with a first visit", () => {
    const r = visitRhythm({ last: null, current: d("2026-11-04"), next: d("2026-12-16") });
    expect(r.sinceLastWeeks).toBeNull();
    expect(r.untilNextWeeks).toBe(6);
    // One known gap is a booking, not a rhythm.
    expect(r.settled).toBe(false);
  });

  it("copes with nothing booked next", () => {
    const r = visitRhythm({ last: d("2026-09-23"), current: d("2026-11-04"), next: null });
    expect(r.sinceLastWeeks).toBe(6);
    expect(r.untilNextWeeks).toBeNull();
    expect(r.settled).toBe(false);
  });

  /*
   * Imported history arrives with rows out of order, and a "last visit"
   * dated after this one would otherwise print a negative week count.
   */
  it("ignores a last visit that is not actually earlier", () => {
    const r = visitRhythm({ last: d("2026-12-01"), current: d("2026-11-04"), next: null });
    expect(r.sinceLastWeeks).toBeNull();
  });

  it("ignores a next booking that is not actually later", () => {
    const r = visitRhythm({ last: null, current: d("2026-11-04"), next: d("2026-10-01") });
    expect(r.untilNextWeeks).toBeNull();
  });

  it("takes dates as strings, which is how they arrive from the API", () => {
    const r = visitRhythm({ last: "2026-09-23T00:00:00Z", current: "2026-11-04T00:00:00Z" });
    expect(r.sinceLastWeeks).toBe(6);
  });

  it("survives an unparseable date rather than throwing on the busiest screen", () => {
    expect(visitRhythm({ current: "not a date" })).toEqual({
      sinceLastWeeks: null, untilNextWeeks: null, settled: false,
    });
    expect(visitRhythm({ last: "rubbish", current: d("2026-11-04") }).sinceLastWeeks).toBeNull();
  });
});

describe("describeWeeks", () => {
  it("reads naturally beside a date", () => {
    expect(describeWeeks(6)).toBe("6 weeks");
    expect(describeWeeks(1)).toBe("1 week");
    expect(describeWeeks(0)).toBe("same day");
    expect(describeWeeks(null)).toBeNull();
  });
});
