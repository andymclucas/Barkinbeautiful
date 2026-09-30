import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowBoard = readFileSync(
  new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url),
  "utf8",
) + readFileSync(
  new URL("../client/src/components/WorkflowBoardTable.tsx", import.meta.url),
  "utf8",
);

describe("Workflow Board Cage and Tag entry visibility", () => {
  it("uses separate high-contrast Cage and Tag entry tones in both headers and editable cells", () => {
    expect(workflowBoard).toContain('bg-blue-900 text-blue-50');
    expect(workflowBoard).toContain('bg-violet-900 text-violet-50');
    // Cage/Tag tone, matched by its parts so an added dark: variant between
    // them does not fail a test about contrast.
    // Matched by parts: dark mode inserts a dark: counterpart after each
    // pale class, so the three no longer sit adjacent in the source.
    expect(workflowBoard).toMatch(/bg-blue-50\/90[^"]*border-x[^"]*border-blue-200\/80/);
    expect(workflowBoard).toMatch(/bg\-violet\-50\/90[^"]*border\-r[^"]*border\-violet\-200\/80/);
    // Cage and Tag must stay visually distinct — the palette consolidation
    // collapsed both to violet once, which this test caught.
    expect(workflowBoard).not.toContain('bg-violet-900 text-violet-50 border-x');
    expect(workflowBoard).toContain('tone="cage"');
    expect(workflowBoard).toContain('tone="tag"');
  });

  it("keeps clear accessible entry labels for both data fields", () => {
    expect(workflowBoard).toContain('aria-label={`Enter ${label} number`}');
    expect(workflowBoard).toContain('title={`Click to enter ${label} number`}');
  });
});
