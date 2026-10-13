import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Delegation checks, in the sense CLAUDE.md §7 allows: they count call sites
 * rather than asserting behaviour from source text.
 *
 * The appointment dialog's per-appointment state lives in the Calendar page
 * component, which never unmounts, so nothing clears it on its own. (The
 * Grooming Report panels need no such list because their state sits inside
 * DialogContent, which Radix destroys on close.)
 *
 * Radix calls onOpenChange only when the USER dismisses a dialog — Esc, an
 * outside click, the X. Closing it programmatically by flipping `open` does
 * not call it. So for as long as the reset list lived inside onOpenChange,
 * five other close paths skipped it entirely, the Cancel button among them.
 *
 * Both of these would have failed on that.
 */
const source = readFileSync(
  new URL("../client/src/pages/Calendar.tsx", import.meta.url),
  "utf8",
);

describe("every appointment-dialog close runs the same reset", () => {
  it("clears the dialog in exactly one place", () => {
    // More than one means a close path is setting editAppt directly and
    // skipping everything else the dialog is holding.
    const direct = source.match(/setEditAppt\(null\)/g) ?? [];
    expect(direct).toHaveLength(1);
  });

  it("routes the other close paths through that one place", () => {
    // Cancel, save, delete, onApplied, and the user-dismiss handler.
    const delegated = source.match(/closeEditDialog/g) ?? [];
    expect(delegated.length).toBeGreaterThanOrEqual(6);
  });

  it("clears the copy-to-all snapshot", () => {
    // It overwrites every field of a grooming report, photos included. Left
    // set, it applies itself to the next dog opened.
    expect(source).toContain("setCopySnap(null)");
  });
});
