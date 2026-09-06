import { describe, expect, it } from "vitest";
import { calculateGroomIntervalStats } from "./groomInterval";

describe("calculateGroomIntervalStats", () => {
  it("calculates average and median intervals from consecutive completed visits per pet", () => {
    const stats = calculateGroomIntervalStats([
      { petId: 1, scheduledStart: "2026-01-01T00:00:00.000Z" },
      { petId: 1, scheduledStart: "2026-02-12T00:00:00.000Z" },
      { petId: 2, scheduledStart: "2026-01-05T00:00:00.000Z" },
      { petId: 2, scheduledStart: "2026-01-19T00:00:00.000Z" },
    ]);

    expect(stats).toEqual({
      averageWeeks: 4,
      medianWeeks: 4,
      intervalCount: 2,
      returningPetCount: 2,
    });
  });

  it("ignores one-off pets, null pets, invalid dates and same-day duplicates", () => {
    const stats = calculateGroomIntervalStats([
      { petId: 1, scheduledStart: "2026-01-01T00:00:00.000Z" },
      { petId: 1, scheduledStart: "2026-01-01T00:00:00.000Z" },
      { petId: 2, scheduledStart: "2026-02-01T00:00:00.000Z" },
      { petId: null, scheduledStart: "2026-02-08T00:00:00.000Z" },
      { petId: 3, scheduledStart: "not-a-date" },
    ]);

    expect(stats).toEqual({ averageWeeks: null, medianWeeks: null, intervalCount: 0, returningPetCount: 0 });
  });
});
