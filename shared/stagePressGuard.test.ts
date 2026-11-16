import { describe, expect, it } from "vitest";
import {
  judgeStagePress, stagePressLocked, STAGE_PRESS_MAX_HOLD_MS, STAGE_PRESS_SETTLE_MS,
} from "./stagePressGuard";

describe("judging a stage press against where the dog really is", () => {
  it("applies a press from a screen that was right", () => {
    expect(judgeStagePress({ expectedFromState: "drying", currentState: "drying", targetState: "waiting_for_groom" })).toBe("apply");
  });

  it("treats a repeat of a press that already landed as nothing to do", () => {
    // Two screens, or one press sent twice: the dog is already where it was sent.
    expect(judgeStagePress({ expectedFromState: "drying", currentState: "waiting_for_groom", targetState: "waiting_for_groom" })).toBe("already_there");
  });

  it("refuses a press from a screen that is behind", () => {
    // The screen still shows ready; the groomer already sent the dog back to grooming.
    expect(judgeStagePress({ expectedFromState: "ready", currentState: "grooming", targetState: "complete" })).toBe("stale");
    // The screen shows drying; someone else has moved it on two stages.
    expect(judgeStagePress({ expectedFromState: "drying", currentState: "grooming", targetState: "waiting_for_groom" })).toBe("stale");
  });

  it("still applies a press from an older screen that does not say what it saw", () => {
    expect(judgeStagePress({ currentState: "grooming", targetState: "complete" })).toBe("apply");
    expect(judgeStagePress({ expectedFromState: null, currentState: "grooming", targetState: "complete" })).toBe("apply");
  });

  it("lets a stage be set to itself when the screen was right", () => {
    expect(judgeStagePress({ expectedFromState: "ready", currentState: "ready", targetState: "ready" })).toBe("apply");
  });
});

describe("holding a dog's stage buttons", () => {
  it("holds until the time given, then lets go", () => {
    expect(stagePressLocked(1000, 999)).toBe(true);
    expect(stagePressLocked(1000, 1000)).toBe(false);
    expect(stagePressLocked(1000, 5000)).toBe(false);
  });

  it("does not hold a dog nobody has pressed", () => {
    expect(stagePressLocked(undefined, 123)).toBe(false);
  });

  it("can never hold a dog for long, even if the server never answers", () => {
    expect(STAGE_PRESS_MAX_HOLD_MS).toBeLessThanOrEqual(30_000);
    expect(STAGE_PRESS_SETTLE_MS).toBeLessThan(STAGE_PRESS_MAX_HOLD_MS);
  });
});
