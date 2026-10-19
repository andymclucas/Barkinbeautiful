import { describe, it, expect } from "vitest";
import { buildRevenueBuckets, bucketDaysFor } from "@shared/revenueBuckets";

/**
 * The regression this file exists for: a daily bucket used to be a
 * zero-width window, so appointment revenue drew as $0 on every range of
 * 31 days or fewer while the rows were sitting right there.
 */

const row = (iso: string, price: string | number) => ({ scheduledStart: new Date(iso), price });

// 1-19 October 2026 as the Brisbane range helper produces it: Brisbane
// midnight is 14:00Z the day before.
const OCT_FROM = new Date("2026-09-30T14:00:00.000Z");
const OCT_TO = new Date("2026-10-19T13:59:59.999Z");

describe("bucketDaysFor", () => {
  it("uses daily buckets up to a month, then weekly, then monthly", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const at = (days: number) => new Date(from.getTime() + days * 86400000);
    expect(bucketDaysFor(from, at(19))).toBe(1);
    expect(bucketDaysFor(from, at(31))).toBe(1);
    expect(bucketDaysFor(from, at(32))).toBe(7);
    expect(bucketDaysFor(from, at(90))).toBe(7);
    expect(bucketDaysFor(from, at(91))).toBe(30);
  });
});

describe("buildRevenueBuckets", () => {
  it("counts an appointment that is not exactly at midnight", () => {
    // THE BUG. A 09:30 Brisbane groom on 1 October fell outside the old
    // window, which ran [midnight..midnight].
    const buckets = buildRevenueBuckets({
      rows: [row("2026-09-30T23:30:00.000Z", "145.00")],
      dateFrom: OCT_FROM, dateTo: OCT_TO, dailyMemberRevenue: 0,
    });
    expect(buckets[0].label).toBe("1 Oct");
    expect(buckets[0].apptRevenue).toBe(145);
  });

  it("loses nothing across the whole range", () => {
    const rows = [
      row("2026-09-30T23:30:00.000Z", "145.00"), // 1 Oct 09:30 Brisbane
      row("2026-10-01T05:00:00.000Z", "90.00"),  // 1 Oct 15:00
      row("2026-10-08T22:00:00.000Z", "250.50"), // 9 Oct 08:00
      row("2026-10-19T03:00:00.000Z", "110.00"), // 19 Oct 13:00
    ];
    const buckets = buildRevenueBuckets({
      rows, dateFrom: OCT_FROM, dateTo: OCT_TO, dailyMemberRevenue: 0,
    });
    const total = buckets.reduce((s, b) => s + b.apptRevenue, 0);
    expect(total).toBeCloseTo(145 + 90 + 250.5 + 110, 2);
  });

  it("puts a groom in exactly one bucket", () => {
    const buckets = buildRevenueBuckets({
      rows: [row("2026-10-08T22:00:00.000Z", "250.50")],
      dateFrom: OCT_FROM, dateTo: OCT_TO, dailyMemberRevenue: 0,
    });
    const hit = buckets.filter((b) => b.apptRevenue > 0);
    expect(hit).toHaveLength(1);
    expect(hit[0].label).toBe("9 Oct");
  });

  it("counts the last day of the range", () => {
    // The final bucket is clamped to dateTo and must stay inclusive of it.
    const buckets = buildRevenueBuckets({
      rows: [row("2026-10-19T13:59:59.000Z", "60.00")],
      dateFrom: OCT_FROM, dateTo: OCT_TO, dailyMemberRevenue: 0,
    });
    expect(buckets[buckets.length - 1].apptRevenue).toBe(60);
  });

  it("gives one bucket per day over a 19-day range", () => {
    const buckets = buildRevenueBuckets({
      rows: [], dateFrom: OCT_FROM, dateTo: OCT_TO, dailyMemberRevenue: 0,
    });
    expect(buckets).toHaveLength(19);
    expect(buckets[0].label).toBe("1 Oct");
    expect(buckets[18].label).toBe("19 Oct");
  });

  it("spreads the membership run-rate a day at a time", () => {
    const buckets = buildRevenueBuckets({
      rows: [], dateFrom: OCT_FROM, dateTo: OCT_TO, dailyMemberRevenue: 585.71,
    });
    expect(buckets[0].memberRevenue).toBeCloseTo(585.71, 2);
    expect(buckets.every((b) => b.memberRevenue === 585.71)).toBe(true);
  });

  it("widens the bucket and the run-rate together on a long range", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-03-01T00:00:00Z"); // 59 days -> weekly
    const buckets = buildRevenueBuckets({
      rows: [row("2026-01-03T05:00:00Z", "100.00")],
      dateFrom: from, dateTo: to, dailyMemberRevenue: 10,
    });
    expect(buckets[0].apptRevenue).toBe(100);
    expect(buckets[0].memberRevenue).toBe(70); // 7 days x $10
  });

  it("ignores a row with no date and reads a null price as zero", () => {
    const buckets = buildRevenueBuckets({
      rows: [
        { scheduledStart: null, price: "999.00" },
        { scheduledStart: new Date("2026-09-30T23:30:00Z"), price: null },
      ],
      dateFrom: OCT_FROM, dateTo: OCT_TO, dailyMemberRevenue: 0,
    });
    expect(buckets.reduce((s, b) => s + b.apptRevenue, 0)).toBe(0);
  });

  it("returns nothing when the range is inverted", () => {
    expect(buildRevenueBuckets({
      rows: [], dateFrom: OCT_TO, dateTo: OCT_FROM, dailyMemberRevenue: 0,
    })).toEqual([]);
  });
});
