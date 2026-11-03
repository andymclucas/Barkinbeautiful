import { describe, expect, it } from "vitest";
import { retentionRows, type RetentionVisit } from "../shared/clientRetention";

const v = (petId: number, iso: string, price: RetentionVisit["price"] = "100.00"): RetentionVisit =>
  ({ petId, scheduledStart: new Date(`${iso}T00:00:00Z`), price });

describe("retentionRows", () => {
  it("reports the dog's usual gap and what it spends", () => {
    const rows = retentionRows([
      v(1, "2026-01-07", "120.00"),
      v(1, "2026-02-18", "120.00"),
      v(1, "2026-04-01", "150.00"),
    ]);
    const dog = rows.get(1)!;
    expect(dog.visits).toBe(3);
    expect(dog.usualGapWeeks).toBe(6);
    expect(dog.averageSpend).toBe(130);
    expect(dog.totalSpend).toBe(390);
    expect(dog.lastVisit).toEqual(new Date("2026-04-01T00:00:00Z"));
  });

  /*
   * The reason the gap is a median. One missed season must not make a
   * settled six-weekly dog look like a twelve-weekly one — the mean of
   * 6, 6, 6 and 30 is 12 and describes no visit that ever happened.
   */
  it("takes the median gap, so one long absence does not rewrite the rhythm", () => {
    const rows = retentionRows([
      v(1, "2026-01-07"), v(1, "2026-02-18"), v(1, "2026-04-01"), v(1, "2026-10-28"),
    ]);
    expect(rows.get(1)!.usualGapWeeks).toBe(6);
  });

  /*
   * And the reason spend is a MEAN. A client who normally pays $90 and
   * once paid $300 really did pay $300, and the question the report
   * answers is what the salon loses if they stop coming.
   */
  it("takes the mean spend, because a big spend is real money", () => {
    const rows = retentionRows([
      v(1, "2026-01-07", "90.00"), v(1, "2026-02-18", "90.00"), v(1, "2026-04-01", "300.00"),
    ]);
    expect(rows.get(1)!.averageSpend).toBe(160);
  });

  /*
   * 737 of the salon's 7,811 completed grooms carry no figure, nearly
   * all MoeGo history. Counting those as zero would halve a regular's
   * apparent value and put them at the bottom of a report whose whole
   * purpose is spotting valuable clients slipping away.
   */
  it("leaves an unpriced groom out of the average rather than calling it zero", () => {
    const rows = retentionRows([
      v(1, "2026-01-07", "120.00"), v(1, "2026-02-18", null), v(1, "2026-04-01", ""),
    ]);
    const dog = rows.get(1)!;
    expect(dog.visits).toBe(3);
    expect(dog.pricedVisits).toBe(1);
    expect(dog.averageSpend).toBe(120);
  });

  /* A membership groom IS a real zero — the weekly fee covered it. */
  it("counts a genuine zero", () => {
    const rows = retentionRows([
      v(1, "2026-01-07", "0.00"), v(1, "2026-02-18", "0.00"), v(1, "2026-04-01", "40.00"),
    ]);
    expect(rows.get(1)!.averageSpend).toBeCloseTo(13.33, 2);
    expect(rows.get(1)!.pricedVisits).toBe(3);
  });

  /* One gap is not a rhythm; the overdue rule uses the same threshold. */
  it("refuses to call two visits a rhythm", () => {
    const rows = retentionRows([v(1, "2026-01-07"), v(1, "2026-02-18")]);
    expect(rows.get(1)!.usualGapWeeks).toBeNull();
    expect(rows.get(1)!.visits).toBe(2);
  });

  it("still reports spend for a dog with too little history for a gap", () => {
    expect(retentionRows([v(1, "2026-01-07", "120.00")]).get(1)!.averageSpend).toBe(120);
  });

  /*
   * A family booking puts two dogs on one day, and a corrected
   * duplicate puts one dog on one day twice. Neither is a nought-week
   * rhythm.
   */
  it("ignores a same-day pair rather than counting a zero-week gap", () => {
    const rows = retentionRows([
      v(1, "2026-01-07"), v(1, "2026-01-07"), v(1, "2026-02-18"), v(1, "2026-04-01"),
    ]);
    expect(rows.get(1)!.usualGapWeeks).toBe(6);
    // The visit still happened and is still counted.
    expect(rows.get(1)!.visits).toBe(4);
  });

  it("keeps dogs apart", () => {
    const rows = retentionRows([
      v(1, "2026-01-07", "100.00"), v(1, "2026-02-18", "100.00"), v(1, "2026-04-01", "100.00"),
      v(2, "2026-01-07", "300.00"), v(2, "2026-07-01", "300.00"), v(2, "2027-01-01", "300.00"),
    ]);
    expect(rows.get(1)!.usualGapWeeks).toBe(6);
    expect(rows.get(2)!.usualGapWeeks).toBeCloseTo(25.9, 0);
    expect(rows.get(2)!.averageSpend).toBe(300);
  });

  it("survives rubbish without throwing on a report page", () => {
    const rows = retentionRows([
      { petId: 1, scheduledStart: "not a date", price: "100" },
      v(1, "2026-01-07", "abc"),
    ]);
    expect(rows.get(1)!.visits).toBe(1);
    expect(rows.get(1)!.averageSpend).toBeNull();
  });

  it("returns nothing for nothing", () => {
    expect(retentionRows([]).size).toBe(0);
  });
});
