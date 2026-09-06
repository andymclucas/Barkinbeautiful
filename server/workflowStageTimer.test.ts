import { describe, expect, it } from "vitest";
import { formatLiveStageElapsed, getLiveStageElapsedSeconds } from "../client/src/lib/workflowStageTimer";

describe("live workflow stage timer", () => {
  it("counts from the persisted active-stage entry time", () => {
    expect(getLiveStageElapsedSeconds({
      workflowState: "bathing",
      stageStartedAt: 1_000,
      checkedInAt: 500,
      scheduledStart: 0,
    }, 66_000)).toBe(65);
  });

  it("does not run for waiting, paused, completed or terminal workflow states", () => {
    for (const workflowState of ["scheduled", "waiting_for_bath", "waiting_for_dry", "waiting_for_groom", "complete", "cancelled", "no_show"]) {
      expect(getLiveStageElapsedSeconds({ workflowState, scheduledStart: 0 }, 60_000)).toBeNull();
    }
  });

  it("formats the live timer as an easily scannable elapsed duration", () => {
    expect(formatLiveStageElapsed(65)).toBe("1:05");
    expect(formatLiveStageElapsed(3_665)).toBe("1h 01m");
  });
});
