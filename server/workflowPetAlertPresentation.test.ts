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
    // Never truncated. The import's own provenance prefix IS dropped — see
    // stripAlertProvenance — so this uses a warning written by the salon.
    const warning = "Bites for face and feet. Do not muzzle; nails last with a second person holding.";
    expect(petAlertText({ alertLevel: "caution", warnings: warning })).toBe(warning);
  });

  it("drops the import's provenance prefix from what the board reads out", () => {
    expect(petAlertText({ alertLevel: "caution", warnings: "MoeGo source alert (20 Aug 2026): allergy to chicken." }))
      .toBe("Allergy to chicken.");
  });
});
