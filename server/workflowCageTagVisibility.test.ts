import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowBoard = readFileSync(
  new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url),
  "utf8",
);

describe("Workflow Board Cage and Tag entry visibility", () => {
  it("uses separate high-contrast Cage and Tag entry tones in both headers and editable cells", () => {
    expect(workflowBoard).toContain('bg-cyan-900 text-cyan-50');
    expect(workflowBoard).toContain('bg-violet-900 text-violet-50');
    expect(workflowBoard).toContain('bg-cyan-50/90 border-x border-cyan-200/80');
    expect(workflowBoard).toContain('bg-violet-50/90 border-r border-violet-200/80');
    expect(workflowBoard).toContain('tone="cage"');
    expect(workflowBoard).toContain('tone="tag"');
  });

  it("keeps clear accessible entry labels for both data fields", () => {
    expect(workflowBoard).toContain('aria-label={`Enter ${label} number`}');
    expect(workflowBoard).toContain('title={`Click to enter ${label} number`}');
  });
});
