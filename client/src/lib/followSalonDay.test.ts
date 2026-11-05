import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDayBefore } from "@shared/calendarDay";

/**
 * The rule the hook applies, exercised directly.
 *
 * The hook itself is three lines around this comparison; what is worth
 * pinning is the decision — forward only, and only when behind.
 */
describe("a board that is left open follows the salon into the new day", () => {
  it("moves forward when the board is behind", () => {
    expect(isDayBefore("2026-11-05", "2026-11-06")).toBe(true);
  });

  it("stays put when somebody is deliberately looking ahead", () => {
    // WorkflowDisplay's "reset for tomorrow", and the board's forward
    // arrow. Being dragged back to today at midnight would undo a choice
    // somebody made on purpose.
    expect(isDayBefore("2026-11-07", "2026-11-06")).toBe(false);
  });

  it("stays put on the current day", () => {
    expect(isDayBefore("2026-11-06", "2026-11-06")).toBe(false);
  });

  it("crosses a month and a year end", () => {
    expect(isDayBefore("2026-11-30", "2026-12-01")).toBe(true);
    expect(isDayBefore("2026-12-31", "2027-01-01")).toBe(true);
  });
});

describe("BOTH wall-screen paths use the shared hook", () => {
  /*
   * A delegation check, which CLAUDE.md section 7 allows exactly this
   * use: proving every call site goes through the shared rule, and
   * counting so it fails when one stops.
   *
   * It earns its place. This bug has been fixed twice. The first fix went
   * into WorkflowDisplay, with a comment explaining that a wall screen
   * left on overnight keeps asking for yesterday — but "Open TV Screen"
   * drives WorkflowBoard, which never got it, so the salon's actual TV
   * went on showing yesterday's dogs every morning until Lauren reported
   * it again on 06/11/2026.
   *
   * Two copies of a fix is how that happened, so the test is about there
   * being one.
   */
  const pages = ["WorkflowBoard", "WorkflowDisplay"] as const;

  for (const page of pages) {
    const source = readFileSync(
      resolve(process.cwd(), `client/src/pages/${page}.tsx`),
      "utf8",
    );

    it(`${page} calls useFollowSalonDay`, () => {
      expect(source, `${page} must follow the salon into the new day`)
        .toContain("useFollowSalonDay(");
    });

    it(`${page} does not roll its own`, () => {
      // An inline isDayBefore against the board date is the shape the
      // duplicate took last time.
      expect(source).not.toMatch(/setBoardDate\(\s*current\s*=>\s*\(?\s*isDayBefore/);
    });
  }
});
