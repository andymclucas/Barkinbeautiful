import { describe, expect, it } from "vitest";
import { shiftDateKey } from "../client/src/lib/workflowDates";

describe("shiftDateKey", () => {
  it("moves forward one calendar day without an ISO timezone rollback", () => {
    expect(shiftDateKey("2026-08-11", 1)).toBe("2026-08-12");
  });

  it("moves backward across a month boundary", () => {
    expect(shiftDateKey("2026-08-01", -1)).toBe("2026-07-31");
  });
});
