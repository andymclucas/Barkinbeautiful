import { describe, expect, it } from "vitest";
import {
  WORKFLOW_BOARD_REFRESH_INTERVAL_MS,
  workflowBoardRefreshOptions,
} from "../client/src/lib/workflowBoardRefresh";

describe("workflow board cross-screen refresh policy", () => {
  it("refreshes visible controller and TV screens within five seconds", () => {
    expect(WORKFLOW_BOARD_REFRESH_INTERVAL_MS).toBe(5_000);
    expect(workflowBoardRefreshOptions.refetchInterval).toBe(5_000);
  });

  it("does not poll hidden tabs and immediately refreshes when they regain focus", () => {
    expect(workflowBoardRefreshOptions.refetchIntervalInBackground).toBe(false);
    expect(workflowBoardRefreshOptions.refetchOnWindowFocus).toBe("always");
  });
});
