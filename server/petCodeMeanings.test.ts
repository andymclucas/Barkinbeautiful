import { describe, expect, it } from "vitest";
import { PET_CODE_MEANINGS, petCodeMeaning, describePetCode } from "@shared/petCodeMeanings";
import { parsePetCodes } from "@shared/petCodes";

describe("what a pet code means", () => {
  it("expands the shorthand nobody can read off the board", () => {
    // These are the ones that made the chips useless on their own.
    expect(petCodeMeaning("Ner")).toBe("Nervous");
    expect(petCodeMeaning("Sen")).toBe("Senior pet");
    expect(petCodeMeaning("Ana")).toBe("Anal gland issue");
    expect(petCodeMeaning("PITA")).toBe("Difficult to groom");
    expect(petCodeMeaning("🦻")).toBe("Deaf");
    expect(petCodeMeaning("🕶️")).toBe("Blind");
    expect(petCodeMeaning("EX. CARE")).toBe("EXTRA DIFFICULT CHARGE");
  });

  it("says nothing when the badge is already the meaning", () => {
    // "SENSITIVE — SENSITIVE" is noise, not help.
    expect(petCodeMeaning("SENSITIVE")).toBeNull();
    expect(petCodeMeaning("DOG AGGRESSIVE")).toBeNull();
    expect(describePetCode("SENSITIVE")).toBe("SENSITIVE");
  });

  it("formats an expansion for the tooltip", () => {
    expect(describePetCode("Ner")).toBe("Ner — Nervous");
  });

  it("leaves a code it has never seen exactly as it is", () => {
    // The salon adds codes whenever it likes. An unknown one must degrade to
    // what the board showed before this existed, not vanish or throw.
    expect(petCodeMeaning("BRAND NEW CODE")).toBeNull();
    expect(describePetCode("BRAND NEW CODE")).toBe("BRAND NEW CODE");
  });

  it("covers Hamish's real codes end to end", () => {
    const codes = parsePetCodes("✂5f, #7f, No cologne, SENSITIVE");
    expect(codes.map(describePetCode)).toEqual([
      "✂5f — #5f blade", "#7f", "No cologne", "SENSITIVE",
    ]);
  });

  it("keeps the two opposite ear codes distinct", () => {
    // One word apart, opposite instructions. Both are real.
    expect(PET_CODE_MEANINGS["PLUCK EARS"]).toBeDefined();
    expect(PET_CODE_MEANINGS["DONT PLUCK EARS"]).toBeDefined();
    expect(describePetCode("PLUCK EARS")).not.toBe(describePetCode("DONT PLUCK EARS"));
  });
});
