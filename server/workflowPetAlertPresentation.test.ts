import { describe, expect, it } from "vitest";
import { normalizePetAlertLevel } from "../shared/petAlertStatus";
import { petAlertTone, petAlertText } from "../shared/petAlert";

/**
 * This used to grep WorkflowBoard source for the inline badge markup. The
 * badge moved into PetAlertButton on 09/10/2026, so the greps broke while
 * the behaviour was fine — the failure mode CLAUDE.md warns about. It now
 * asserts the rules themselves.
 */
describe("workflow pet-alert presentation", () => {
  it("still treats 'ok' and junk as no alert", () => {
    expect(normalizePetAlertLevel("ok")).toBeNull();
    expect(normalizePetAlertLevel("")).toBeNull();
    expect(normalizePetAlertLevel(undefined)).toBeNull();
    expect(normalizePetAlertLevel("caution")).toBe("caution");
    expect(normalizePetAlertLevel("danger")).toBe("danger");
  });

  it("drives the board flag off the same rule", () => {
    expect(petAlertTone({ alertLevel: "ok" })).toBeNull();
    expect(petAlertTone({ alertLevel: "danger" })).toBe("danger");
    expect(petAlertTone({ alertLevel: "caution" })).toBe("caution");
  });

  it("gives an accessible description with the warning in full", () => {
    const warning = "MoeGo source alert (20 Aug 2026): allergy to beef and green ants.";
    expect(petAlertText({ alertLevel: "caution", warnings: warning })).toBe(warning);
  });
});
