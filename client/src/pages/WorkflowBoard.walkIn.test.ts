import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * There is one walk-in dialog, and both entry points use it.
 *
 * This is a delegation count, not a test of what the dialog does — that
 * lives in `server/quickAppointment.test.ts` against the shared rules.
 * It exists because the thing that broke here was duplication, exactly
 * as CLAUDE.md section 7 describes: the Workflow board carried its own
 * hand-rolled walk-in form with six fields, a violet "Add to Board"
 * button and a green "Walk-in added" toast, and it wrote NOTHING. Its
 * own comment claimed it added a local placeholder row; it did not add
 * that either. Staff pressed it and the dog never appeared.
 *
 * It survived because nothing tied the board's walk-in to the real one.
 * `calendar.createQuickAppointment` landed on 06/11/2026 and the board
 * went on using its own. So the invariant worth pinning is not a
 * behaviour, it is that neither screen grows a second implementation —
 * and a count is what fails when one does.
 */
function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const ENTRY_POINTS = [
  "client/src/pages/WorkflowBoard.tsx",
  "client/src/pages/Calendar.tsx",
];

describe("the walk-in dialog is shared, not copied", () => {
  it("is reached through the one component from every screen that offers it", () => {
    for (const file of ENTRY_POINTS) {
      const uses = source(file).match(/<QuickAppointmentDialog\b/g) ?? [];
      expect(uses, `${file} should render the shared dialog exactly once`).toHaveLength(1);
    }
  });

  it("leaves no local walk-in form state behind on the board", () => {
    /*
     * The old implementation was six `walkIn*` useState hooks plus a
     * client search. Any reappearance of that prefix means somebody has
     * started a second form rather than extending the shared one.
     */
    expect(source("client/src/pages/WorkflowBoard.tsx")).not.toMatch(/\bwalkIn[A-Z]/);
  });

  it("never announces a walk-in the server was not asked to create", () => {
    /*
     * The specific lie: a success toast fired from the click handler
     * with no mutation behind it. The shared dialog only toasts from
     * its mutation's onSuccess, so the board must not toast about a
     * walk-in at all.
     */
    const board = source("client/src/pages/WorkflowBoard.tsx");
    expect(board).not.toMatch(/toast\.success\([^)]*[Ww]alk-?in/);
  });
});
