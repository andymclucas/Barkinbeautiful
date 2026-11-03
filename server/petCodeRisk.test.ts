import { describe, expect, it } from "vitest";
import { hasBiteWarning, isBiteWarning } from "../shared/petCodeRisk";

describe("isBiteWarning", () => {
  /* The two that are actually in the salon's data today, spelled as
     staff typed them: "Bites" on 21 dogs, the other on 6. */
  it("catches the codes in use today", () => {
    expect(isBiteWarning("Bites")).toBe(true);
    expect(isBiteWarning("Bites For Feet/ Nails")).toBe(true);
  });

  /*
   * Matched on the word, not the two literal strings, because MoeGo's
   * labels are free text. A new spelling must be caught the first time
   * somebody types it — a missed one is somebody getting bitten.
   */
  it("catches a spelling nobody has typed yet", () => {
    for (const code of ["bites feet", "BITES", "Will bite", "biter", "Bites when brushed", "Biting"]) {
      expect(isBiteWarning(code), code).toBe(true);
    }
  });

  /*
   * The other half of the promise. shared/petCodes.ts refuses to grade
   * codes by severity partly because crying wolf on a blade number
   * would teach groomers to ignore the colour.
   */
  it("does not fire on ordinary codes", () => {
    for (const code of ["#7f", "✂5f", "#13mm", "Style C", "Char Do", "No cologne", "PLUCK EARS", "SENSITIVE", "WARTS/ MOLES"]) {
      expect(isBiteWarning(code), code).toBe(false);
    }
  });

  /* Word-boundary, so letters inside another word cannot set it off. */
  it("does not fire on a word that merely contains the letters", () => {
    for (const code of ["Rabbit cut", "a bit short", "bitsa", "orbital"]) {
      expect(isBiteWarning(code), code).toBe(false);
    }
  });

  /*
   * Left plain ON PURPOSE — same class of risk, but Andy asked for
   * bites specifically. Pinned so that including them later is a
   * deliberate change to this test, not a silent drift.
   */
  it("leaves the aggression codes plain, which is a decision not an oversight", () => {
    expect(isBiteWarning("DOG AGGRESSIVE")).toBe(false);
    expect(isBiteWarning("CAGE AGGRESSIVE")).toBe(false);
    expect(isBiteWarning("muzzle")).toBe(false);
  });

  it("copes with nothing", () => {
    expect(isBiteWarning(null)).toBe(false);
    expect(isBiteWarning(undefined)).toBe(false);
    expect(isBiteWarning("   ")).toBe(false);
  });
});

describe("hasBiteWarning", () => {
  it("finds one among a dog's codes", () => {
    expect(hasBiteWarning(["#7f", "Char Do", "Bites"])).toBe(true);
    expect(hasBiteWarning(["#7f", "Char Do"])).toBe(false);
    expect(hasBiteWarning([])).toBe(false);
  });
});
