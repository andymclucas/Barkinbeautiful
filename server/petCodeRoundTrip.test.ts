import { describe, it, expect } from "vitest";
import { parsePetCodes } from "../shared/petCodes";

/**
 * What `pets.updateCodes` stores, and what reads it back.
 *
 * The mutation round-trips the submitted array through parsePetCodes and
 * joins it with ", ". Everything that displays a dog's codes parses the
 * same string, so the two must agree — a stored form the parser cannot
 * read back is a dog whose codes silently vanish from the board.
 */
const store = (codes: string[]): string | null => {
  const cleaned = parsePetCodes(codes.join(","));
  return cleaned.length > 0 ? cleaned.join(", ") : null;
};

describe("storing a dog's codes", () => {
  it("round-trips exactly what was picked", () => {
    const picked = ["✂5f", "SENSITIVE", "PLUCK EARS"];
    expect(parsePetCodes(store(picked))).toEqual(picked);
  });

  it("drops a duplicate however it was cased", () => {
    // Picking the same code twice is a slip, not meaning.
    expect(parsePetCodes(store(["SENSITIVE", "sensitive"]))).toEqual(["SENSITIVE"]);
  });

  it("keeps codes in the order they were added", () => {
    // Groomers read them left to right and put the important one first.
    expect(parsePetCodes(store(["Bites", "✂5f"]))).toEqual(["Bites", "✂5f"]);
  });

  it("stores null rather than an empty string when the last code is removed", () => {
    // hasPetCodes and every render path test for emptiness; an empty
    // string would render an empty chip row.
    expect(store([])).toBeNull();
    expect(store(["   "])).toBeNull();
  });

  it("survives a code containing the separator's spacing", () => {
    // The import wrote ", " and codes like "WARTS/ MOLES" contain a
    // space, so the join and the split must not disagree.
    expect(parsePetCodes(store(["WARTS/ MOLES", "#3"]))).toEqual(["WARTS/ MOLES", "#3"]);
  });

  it("keeps two codes that differ only by a suffix apart", () => {
    // "#3" and "#3 PFFT" are both real codes in this salon.
    expect(parsePetCodes(store(["#3", "#3 PFFT"]))).toEqual(["#3", "#3 PFFT"]);
  });

  it("keeps the opposites apart", () => {
    // "PLUCK EARS" and "DONT PLUCK EARS" are both real, and confusing
    // them is a welfare problem rather than a display one.
    expect(parsePetCodes(store(["PLUCK EARS", "DONT PLUCK EARS"])))
      .toEqual(["PLUCK EARS", "DONT PLUCK EARS"]);
  });
});
