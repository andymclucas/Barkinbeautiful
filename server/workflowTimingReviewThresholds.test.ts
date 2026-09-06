import { describe, expect, it } from "vitest";
import { DEFAULT_TIMING_REVIEW_THRESHOLDS, getTimingReviewScopeKey, resolveTimingReviewThreshold, type TimingReviewThresholdRule } from "../shared/workflowTimingReviewThresholds";

const rules: TimingReviewThresholdRule[] = [
  { scope: "default", scopeKey: "default", bathMinutes: 95, dryMinutes: 80, groomMinutes: 155, totalMinutes: 250 },
  { scope: "size", scopeKey: "size:large", petSize: "large", bathMinutes: 110, dryMinutes: 90, groomMinutes: 180, totalMinutes: 285 },
  { scope: "breed", scopeKey: "breed:standard poodle", breedName: "Standard Poodle", bathMinutes: 125, dryMinutes: 100, groomMinutes: 210, totalMinutes: 320 },
];

describe("workflow timing review threshold precedence", () => {
  it("uses the salon default when no size or breed override applies", () => {
    expect(resolveTimingReviewThreshold({ breed: "Cavoodle", weightKg: 8 }, rules)).toMatchObject({
      thresholds: { bathMinutes: 95, dryMinutes: 80, groomMinutes: 155, totalMinutes: 250 },
      source: "Salon default",
      scope: "default",
    });
  });

  it("uses a matching pet-size preset ahead of the salon default", () => {
    expect(resolveTimingReviewThreshold({ breed: "Labrador", weightKg: 22 }, rules)).toMatchObject({
      thresholds: { bathMinutes: 110, dryMinutes: 90, groomMinutes: 180, totalMinutes: 285 },
      source: "Size preset · Large",
      scope: "size",
    });
  });

  it("uses a case-insensitive breed override ahead of a matching pet-size preset", () => {
    expect(resolveTimingReviewThreshold({ breed: " standard   POODLE ", weightKg: 24 }, rules)).toMatchObject({
      thresholds: { bathMinutes: 125, dryMinutes: 100, groomMinutes: 210, totalMinutes: 320 },
      source: "Breed override · Standard Poodle",
      scope: "breed",
    });
  });

  it("falls back to the standard triggers when the salon has not saved any configuration", () => {
    expect(resolveTimingReviewThreshold({ breed: "Greyhound", weightKg: 30 }, [])).toEqual({
      thresholds: DEFAULT_TIMING_REVIEW_THRESHOLDS,
      source: "Standard default",
      scope: "default",
    });
  });

  it("uses canonical keys so duplicate size and breed presets cannot be created for a tenant", () => {
    expect(getTimingReviewScopeKey({ scope: "default" })).toBe("default");
    expect(getTimingReviewScopeKey({ scope: "size", petSize: "giant" })).toBe("size:giant");
    expect(getTimingReviewScopeKey({ scope: "breed", breedName: "  Standard   Poodle " })).toBe("breed:standard poodle");
  });
});
