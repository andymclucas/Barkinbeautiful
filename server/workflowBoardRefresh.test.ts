import { describe, expect, it } from "vitest";
import {
  WORKFLOW_BOARD_CHECK_INTERVAL_MS,
  WORKFLOW_BOARD_FULL_REFRESH_INTERVAL_MS,
  workflowBoardRefreshOptions,
  workflowBoardVersionOptions,
} from "../client/src/lib/workflowBoardRefresh";

describe("workflow board cross-screen refresh policy", () => {
  it("checks for changes from other screens every five seconds", () => {
    expect(WORKFLOW_BOARD_CHECK_INTERVAL_MS).toBe(5_000);
    expect(workflowBoardVersionOptions.refetchInterval).toBe(5_000);
  });

  it("reloads the whole board only once a minute on a timer", () => {
    expect(WORKFLOW_BOARD_FULL_REFRESH_INTERVAL_MS).toBe(60_000);
    expect(workflowBoardRefreshOptions.refetchInterval).toBe(60_000);
  });

  it("does not poll hidden tabs and immediately refreshes when they regain focus", () => {
    expect(workflowBoardRefreshOptions.refetchIntervalInBackground).toBe(false);
    expect(workflowBoardVersionOptions.refetchIntervalInBackground).toBe(false);
    expect(workflowBoardRefreshOptions.refetchOnWindowFocus).toBe("always");
  });
});
