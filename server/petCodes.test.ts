import { describe, expect, it } from "vitest";
import { parsePetCodes, hasPetCodes } from "@shared/petCodes";

describe("MoeGo pet codes", () => {
  it("splits Hamish's real tags in the order MoeGo holds them", () => {
    // Pet 28407216, Doug Taylor's Hamish — exactly as the export has it.
    expect(parsePetCodes("✂5f, #7f, No cologne, SENSITIVE")).toEqual([
      "✂5f", "#7f", "No cologne", "SENSITIVE",
    ]);
  });

  it("keeps codes that contain spaces, slashes and symbols", () => {
    // Real codes from the 93: these must survive intact or the chip lies.
    expect(parsePetCodes("WARTS/ MOLES, FREAKS @ DRYER, Dont shave groin / bum, 🦻")).toEqual([
      "WARTS/ MOLES", "FREAKS @ DRYER", "Dont shave groin / bum", "🦻",
    ]);
  });

  it("drops blanks and repeats without reordering the rest", () => {
    expect(parsePetCodes("✂5f, , #7f,✂5F ,#7f")).toEqual(["✂5f", "#7f"]);
  });

  it("treats nothing as nothing", () => {
    for (const empty of [null, undefined, "", "   ", ",,, ,"]) {
      expect(parsePetCodes(empty)).toEqual([]);
      expect(hasPetCodes(empty)).toBe(false);
    }
    expect(hasPetCodes("SENSITIVE")).toBe(true);
  });
});
