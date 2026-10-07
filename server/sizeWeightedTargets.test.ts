import { describe, expect, it } from "vitest";
import {
  SIZE_HOURS, MIN_SAMPLE, MAX_ADJUSTMENT,
  rateForMix, mixDifficulty, weightTargetForMix, describeDifficulty,
} from "@shared/sizeWeightedTargets";

/** The salon's real twelve-month figures, as at 07/10/2026. */
const STATS = {
  small: { count: 3384, averagePrice: 138.25 },
  small_medium: { count: 629, averagePrice: 142.89 },
  medium: { count: 300, averagePrice: 168.07 },
  large: { count: 306, averagePrice: 178.81 },
  extra_large: { count: 154, averagePrice: 190.32 },
  giant: { count: 37, averagePrice: 213.65 },
};
/** Weighted across the whole salon over the same window. */
const SALON_RATE = 123.95;

describe("the salon's own numbers", () => {
  it("shows a giant earning roughly half a small's hourly rate", () => {
    // This is the whole premise. Price rises with size; chair time rises
    // faster.
    const small = rateForMix({ small: 1 }, STATS)!;
    const giant = rateForMix({ giant: 1 }, STATS)!;
    expect(Math.round(small)).toBe(138);
    expect(Math.round(giant)).toBe(71);
    expect(giant / small).toBeLessThan(0.6);
  });

  it("takes chair time from the salon's own duration model", () => {
    expect(SIZE_HOURS.small).toBe(1);
    expect(SIZE_HOURS.medium).toBe(1.5);
    expect(SIZE_HOURS.giant).toBe(3);
  });
});

describe("how hard a book was", () => {
  it("rates a heavy book below the salon average", () => {
    const d = mixDifficulty({ large: 6, extra_large: 4 }, STATS, SALON_RATE)!;
    expect(d).toBeLessThan(1);
  });

  it("rates an all-small book above it", () => {
    const d = mixDifficulty({ small: 12 }, STATS, SALON_RATE)!;
    expect(d).toBeGreaterThan(1);
  });

  it("ignores a band with too few grooms to trust", () => {
    // Giant had 37 in a year; one unusual dog moves that average a long
    // way, and a target should not move with it.
    const thin = { ...STATS, giant: { count: 3, averagePrice: 600 } };
    const withGiants = rateForMix({ small: 10, giant: 2 }, thin);
    const withoutGiants = rateForMix({ small: 10 }, thin);
    expect(withGiants).toBe(withoutGiants);
    expect(MIN_SAMPLE).toBe(20);
  });

  it("has nothing to say when no band is usable", () => {
    expect(rateForMix({}, STATS)).toBeNull();
    expect(rateForMix({ giant: 2 }, { giant: { count: 1, averagePrice: 200 } })).toBeNull();
    expect(mixDifficulty({ small: 5 }, STATS, null)).toBeNull();
    expect(mixDifficulty({ small: 5 }, STATS, 0)).toBeNull();
  });
});

describe("moving the target", () => {
  it("lowers it for a heavier book", () => {
    const w = weightTargetForMix(2000, { large: 5, extra_large: 5 }, STATS, SALON_RATE)!;
    expect(w.adjusted).toBeLessThan(2000);
    expect(w.flat).toBe(2000);
  });

  it("raises it for a lighter one", () => {
    const w = weightTargetForMix(2000, { small: 16 }, STATS, SALON_RATE)!;
    expect(w.adjusted).toBeGreaterThan(2000);
  });

  it("caps the move, so a freak week is not a rewrite", () => {
    // Three giants in a quiet week would otherwise halve somebody's target,
    // which reads as excusing them rather than measuring them.
    const w = weightTargetForMix(2000, { extra_large: 10 }, STATS, SALON_RATE)!;
    expect(w.capped).toBe(true);
    expect(w.difficulty).toBe(1 - MAX_ADJUSTMENT);
    expect(w.adjusted).toBe(1200);
  });

  it("caps upward too", () => {
    const stats = { small: { count: 500, averagePrice: 400 } };
    const w = weightTargetForMix(2000, { small: 10 }, stats, 100)!;
    expect(w.capped).toBe(true);
    expect(w.adjusted).toBe(2800);
  });

  it("says nothing without a target to move", () => {
    expect(weightTargetForMix(null, { small: 5 }, STATS, SALON_RATE)).toBeNull();
    expect(weightTargetForMix(0, { small: 5 }, STATS, SALON_RATE)).toBeNull();
  });

  it("says nothing when the book cannot be rated", () => {
    expect(weightTargetForMix(2000, {}, STATS, SALON_RATE)).toBeNull();
  });
});

describe("explaining it in a line", () => {
  it("says which way and by how much", () => {
    const heavy = weightTargetForMix(2000, { extra_large: 10 }, STATS, SALON_RATE);
    expect(describeDifficulty(heavy)).toBe("Heavier dogs than usual — target lowered 40% (capped).");
    const light = weightTargetForMix(2000, { small: 16 }, STATS, SALON_RATE);
    expect(describeDifficulty(light)).toMatch(/^Lighter dogs than usual — target raised \d+%\.$/);
  });

  it("says nothing when there is nothing to say", () => {
    expect(describeDifficulty(null)).toBeNull();
  });
});
