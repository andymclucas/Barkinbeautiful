import { describe, it, expect } from "vitest";
import {
  formatStageDuration,
  slowestStage,
  splitTimingStages,
  timingChartRows,
} from "@shared/workflowTimingChart";

const STAGES = [
  { key: "waiting_for_bath", label: "Waiting for bath", avgMinutes: 22, sampleSize: 140 },
  { key: "bathing", label: "Bathing", avgMinutes: 35, sampleSize: 138 },
  { key: "drying", label: "Drying", avgMinutes: 48, sampleSize: 131 },
  { key: "grooming", label: "Grooming", avgMinutes: 61, sampleSize: 129 },
  { key: "total", label: "Total", avgMinutes: 186, sampleSize: 125 },
];

describe("splitTimingStages", () => {
  it("takes the total out of the list of stages", () => {
    // The total is not a category alongside its own parts. Left in, it is
    // always the longest bar, so every stage is squashed against it and
    // the one bar that reaches the end says nothing.
    const { total, stages } = splitTimingStages(STAGES);
    expect(total?.avgMinutes).toBe(186);
    expect(stages.map((s) => s.key)).not.toContain("total");
    expect(stages).toHaveLength(4);
  });

  it("copes with a report that has no total row", () => {
    const { total, stages } = splitTimingStages(STAGES.slice(0, 2));
    expect(total).toBeNull();
    expect(stages).toHaveLength(2);
  });
});

describe("timingChartRows", () => {
  it("keeps the stages in the order a dog goes through them", () => {
    // Sorting by length would read as a ranking and lose the one thing the
    // sequence tells you — WHERE in the day the time goes.
    expect(timingChartRows(STAGES).map((s) => s.key))
      .toEqual(["waiting_for_bath", "bathing", "drying", "grooming"]);
  });

  it("drops a stage nothing was measured in", () => {
    // A bar of zero height with no samples behind it reads as "instant"
    // rather than "not measured".
    const rows = timingChartRows([...STAGES, { key: "nail_trim", label: "Nails", avgMinutes: 0, sampleSize: 0 }]);
    expect(rows.map((s) => s.key)).not.toContain("nail_trim");
  });
});

describe("slowestStage", () => {
  it("finds where the day actually goes", () => {
    expect(slowestStage(STAGES)?.key).toBe("grooming");
  });

  it("never answers with the total", () => {
    expect(slowestStage(STAGES)?.key).not.toBe("total");
  });

  it("says nothing when there is nothing measured", () => {
    expect(slowestStage([])).toBeNull();
    expect(slowestStage([{ key: "bathing", label: "Bathing", avgMinutes: 10, sampleSize: 0 }])).toBeNull();
  });
});

describe("formatStageDuration", () => {
  it("reads like a person would say it", () => {
    expect(formatStageDuration(45)).toBe("45m");
    expect(formatStageDuration(80)).toBe("1h 20m");
    expect(formatStageDuration(120)).toBe("2h");
  });

  it("rounds rather than truncating", () => {
    // 89.6 minutes is an hour and a half. "1h 29m" reads as precision an
    // average does not have.
    expect(formatStageDuration(89.6)).toBe("1h 30m");
  });

  it("says nothing rather than zero when there is no measurement", () => {
    expect(formatStageDuration(0)).toBe("—");
    expect(formatStageDuration(null)).toBe("—");
    expect(formatStageDuration(undefined)).toBe("—");
    expect(formatStageDuration(Number.NaN)).toBe("—");
  });
});
