import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizePetAlertLevel } from "../shared/petAlertStatus";

describe("workflow pet-alert presentation", () => {
  it("shows only actionable alert levels and supplies accessible warning context", () => {
    const workflowSource = readFileSync(new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url), "utf8");

    expect(normalizePetAlertLevel("ok")).toBeNull();
    expect(normalizePetAlertLevel("caution")).toBe("caution");
    expect(normalizePetAlertLevel("danger")).toBe("danger");
    expect(workflowSource).toContain('appt.petAlertLevel === "danger"');
    expect(workflowSource).toContain('appt.petAlertLevel === "caution"');
    expect(workflowSource).toContain("aria-label={`Danger alert");
    expect(workflowSource).not.toContain('appt.petAlertLevel === "ok"');
  });
});
