import { describe, it, expect } from "vitest";
import {
  weightTrend, weightPoints, describeWeightTrend,
  NOTABLE_CHANGE_PERCENT, NOISE_FLOOR_KG,
  type WeightEntry,
} from "@shared/petWeightHistory";

const at = (iso: string) => new Date(`${iso}T00:00:00+10:00`);
const e = (id: number, kg: string | number, iso: string): WeightEntry =>
  ({ id, weightKg: kg, recordedAt: at(iso) });

describe("weightPoints", () => {
  it("puts readings in the order they happened, whatever order they arrive", () => {
    const points = weightPoints([e(3, 12, "2026-09-01"), e(1, 10, "2026-05-01"), e(2, 11, "2026-07-01")]);
    expect(points.map((p) => p.kg)).toEqual([10, 11, 12]);
  });

  it("reads the decimal strings the database returns", () => {
    expect(weightPoints([e(1, "14.50", "2026-05-01")])[0]!.kg).toBe(14.5);
  });

  it("drops junk rather than plotting it", () => {
    const points = weightPoints([
      e(1, 10, "2026-05-01"),
      e(2, "not a weight", "2026-06-01"),
      e(3, 0, "2026-07-01"),
      e(4, -5, "2026-08-01"),
      { id: 5, weightKg: 12, recordedAt: "nonsense" },
    ]);
    expect(points.map((p) => p.id)).toEqual([1]);
  });
});

describe("weightTrend", () => {
  it("says nothing at all with no readings", () => {
    const t = weightTrend([]);
    expect(t.latest).toBeNull();
    expect(t.direction).toBeNull();
    expect(describeWeightTrend(t)).toBeNull();
  });

  it("calls one reading a fact, not a trend", () => {
    // "Steady" here would invent a history the dog does not have.
    const t = weightTrend([e(1, 12, "2026-05-01")]);
    expect(t.direction).toBeNull();
    expect(t.changeKg).toBeNull();
    expect(describeWeightTrend(t)).toBe("12 kg — first recorded weight.");
  });

  it("measures the change between the two most recent readings", () => {
    const t = weightTrend([e(1, 10, "2026-05-01"), e(2, 11, "2026-06-01"), e(3, 12, "2026-07-01")]);
    expect(t.changeKg).toBeCloseTo(1);
    expect(t.changePercent).toBeCloseTo(100 / 11);
    expect(t.direction).toBe("up");
    expect(t.daysBetween).toBeCloseTo(30);
  });

  it("treats a wriggle on the scales as steady, not a loss", () => {
    const t = weightTrend([e(1, 12, "2026-05-01"), e(2, 11.95, "2026-06-01")]);
    expect(t.direction).toBe("steady");
    expect(t.notable).toBe(false);
    expect(describeWeightTrend(t)).toMatch(/about the same/);
  });

  it("flags a change past a tenth of the dog's body weight", () => {
    const gained = weightTrend([e(1, 10, "2026-05-01"), e(2, 11.2, "2026-08-01")]);
    expect(gained.notable).toBe(true);
    expect(describeWeightTrend(gained)).toMatch(/worth mentioning to the owner/);

    const lost = weightTrend([e(1, 20, "2026-05-01"), e(2, 17, "2026-08-01")]);
    expect(lost.direction).toBe("down");
    expect(lost.notable).toBe(true);
    expect(describeWeightTrend(lost)).toMatch(/3\.0 kg lighter/);
  });

  it("does not flag a change under the threshold", () => {
    // 5% on a big dog is a kilo, and a kilo on a 20kg dog is a meal.
    const t = weightTrend([e(1, 20, "2026-05-01"), e(2, 21, "2026-08-01")]);
    expect(t.notable).toBe(false);
    expect(t.direction).toBe("up");
    expect(describeWeightTrend(t)).not.toMatch(/worth mentioning/);
  });

  it("scales the threshold to the dog, not a fixed number of kilos", () => {
    // 1.2kg is notable on a 10kg dog and unremarkable on a 40kg one —
    // a single kilo cutoff would nag about every big dog and miss every
    // small one.
    expect(weightTrend([e(1, 10, "2026-05-01"), e(2, 11.2, "2026-08-01")]).notable).toBe(true);
    expect(weightTrend([e(1, 40, "2026-05-01"), e(2, 41.2, "2026-08-01")]).notable).toBe(false);
  });

  it("pins the thresholds so a change to them is deliberate", () => {
    expect(NOTABLE_CHANGE_PERCENT).toBe(10);
    expect(NOISE_FLOOR_KG).toBe(0.1);
  });
});
