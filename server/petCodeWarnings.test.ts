import { describe, expect, it } from "vitest";
import { indexPetCodes } from "@shared/petCodeCatalogue";
import {
  describeWarningCode,
  isAlwaysWarningCode,
  isWarningCode,
  splitWarningCodes,
  warningCodesIn,
  warningCodesText,
} from "@shared/petCodeWarnings";

const catalogue = indexPetCodes([
  { code: "SENSITIVE", description: "SENSITIVE", isWarning: true },
  { code: "PITA", description: "Difficult to groom", isWarning: true },
  { code: "Ner", description: "Nervous", isWarning: true },
  { code: "PLUCK EARS", description: "Pluck ears", isWarning: false },
  { code: "✂5f", description: "5F blade" },
]);
const empty = indexPetCodes([]);

describe("pet-code warnings", () => {
  /**
   * The catalogue decides, not the capital letters: PLUCK EARS is in
   * capitals and is a clip instruction, "Ner" is not and is a warning.
   */
  it("takes the catalogue's word for which codes are warnings", () => {
    expect(isWarningCode("SENSITIVE", catalogue)).toBe(true);
    expect(isWarningCode("Ner", catalogue)).toBe(true);
    expect(isWarningCode("PLUCK EARS", catalogue)).toBe(false);
    expect(isWarningCode("✂5f", catalogue)).toBe(false);
  });

  it("matches a code however it was capitalised", () => {
    expect(isWarningCode("sensitive", catalogue)).toBe(true);
    expect(isWarningCode("  Pita ", catalogue)).toBe(true);
  });

  /**
   * The floor. A groomer can type a code nobody has catalogued, and the
   * catalogue has not loaded on first paint — neither may hide these.
   */
  it("treats bites, aggression and a muzzle as warnings with no catalogue at all", () => {
    for (const code of ["DOG AGGRESSIVE", "CAGE AGGRESSIVE", "cage aggression", "MUZZLE", "Muzzled", "Bites"]) {
      expect(isAlwaysWarningCode(code)).toBe(true);
      expect(isWarningCode(code, empty)).toBe(true);
    }
  });

  it("cannot have the floor switched off by a catalogue row", () => {
    const off = indexPetCodes([{ code: "DOG AGGRESSIVE", isWarning: false }]);
    expect(isWarningCode("DOG AGGRESSIVE", off)).toBe(true);
  });

  it("does not call an ordinary uncatalogued code a warning", () => {
    expect(isAlwaysWarningCode("SENSITIVE")).toBe(false);
    expect(isWarningCode("SENSITIVE", empty)).toBe(false);
    expect(isWarningCode("", catalogue)).toBe(false);
    expect(isWarningCode(null, catalogue)).toBe(false);
  });

  it("splits a dog's codes into warnings and the rest, keeping their order", () => {
    const codes = ["✂5f", "SENSITIVE", "PLUCK EARS", "DOG AGGRESSIVE", "Ner"];
    expect(warningCodesIn(codes, catalogue)).toEqual(["SENSITIVE", "DOG AGGRESSIVE", "Ner"]);
    expect(splitWarningCodes(codes, catalogue)).toEqual({
      warnings: ["SENSITIVE", "DOG AGGRESSIVE", "Ner"],
      codes: ["✂5f", "PLUCK EARS"],
    });
  });

  it("spells out a meaning only when it adds something", () => {
    expect(describeWarningCode("PITA", catalogue)).toBe("PITA — Difficult to groom");
    // Half the catalogue is filled in as the code repeated.
    expect(describeWarningCode("SENSITIVE", catalogue)).toBe("SENSITIVE");
  });

  it("gives one line for the red box, or null when the dog has no warnings", () => {
    expect(warningCodesText(["✂5f", "PITA", "SENSITIVE"], catalogue)).toBe(
      "PITA — Difficult to groom · SENSITIVE",
    );
    expect(warningCodesText(["✂5f", "PLUCK EARS"], catalogue)).toBeNull();
    expect(warningCodesText([], catalogue)).toBeNull();
  });
});
