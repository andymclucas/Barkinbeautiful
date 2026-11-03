import { describe, expect, it } from "vitest";
import { RESTING_CODE_LIMIT, isNewCode, searchPetCodes } from "../shared/petCodeSearch";

/**
 * Shapes taken from the salon's real vocabulary (see `shared/petCodes.ts`):
 * clip specs, style shorthand, handling rules and safety flags, in the
 * (sortOrder, code) order `petCodes.list` returns them in.
 */
const code = (c: string, description: string | null, dogsUsing?: number | null) =>
  ({ code: c, description, dogsUsing });

const CATALOGUE = [
  code("#16mm", "16mm all over", 4),
  code("#3", "Blade 3 body", 31),
  code("#3 PFFT", "Blade 3, blow out the coat", 2),
  code("#5f", "Blade 5 finish", 58),
  code("Bites", "Has bitten a groomer", 6),
  code("Char Do", "Charlotte's usual style for this dog", 9),
  code("DOG AGGRESSIVE", "Cannot be near other dogs", 12),
  code("Ner", "Nervous dog, go slowly", 23),
  code("No cologne", "Owner asks for no cologne", 40),
  code("PLUCK EARS", "Pluck the ears every visit", 17),
  code("muzzle", "Needs a muzzle", 8),
];

const codesOf = (hits: { entry: { code: string } }[]) => hits.map((h) => h.entry.code);

describe("searchPetCodes — what the dog already has", () => {
  it("drops codes already on the dog, so every chip can change something", () => {
    const hits = searchPetCodes(CATALOGUE, "", { exclude: ["#5f", "Ner"] });
    expect(codesOf(hits)).not.toContain("#5f");
    expect(codesOf(hits)).not.toContain("Ner");
    expect(hits).toHaveLength(CATALOGUE.length - 2);
  });

  it("matches the exclusion on case, because a dog carries free text", () => {
    // The dog's codes are whatever a groomer typed; the catalogue says "muzzle".
    const hits = searchPetCodes(CATALOGUE, "", { exclude: ["MUZZLE", "  #5F "] });
    expect(codesOf(hits)).not.toContain("muzzle");
    expect(codesOf(hits)).not.toContain("#5f");
  });

  it("still excludes while searching", () => {
    const hits = searchPetCodes(CATALOGUE, "#3", { exclude: ["#3"] });
    expect(codesOf(hits)).toEqual(["#3 PFFT"]);
  });
});

describe("searchPetCodes — resting order, nothing typed", () => {
  it("leads with the codes most dogs actually carry", () => {
    const hits = searchPetCodes(CATALOGUE, "");
    // NOT alphabetical: that opens on #16mm, #3, #3 PFFT — three blade
    // numbers and no handling rule, which is the order that made the
    // picker useless.
    expect(codesOf(hits).slice(0, 4)).toEqual(["#5f", "No cologne", "#3", "Ner"]);
  });

  it("puts a code no dog carries last rather than hiding it", () => {
    const withUnused = [...CATALOGUE, code("Retired code", "Nobody uses this", 0)];
    const hits = searchPetCodes(withUnused, "");
    expect(codesOf(hits).at(-1)).toBe("Retired code");
    expect(hits).toHaveLength(withUnused.length);
  });

  it("keeps the catalogue's own order between equally-carried codes", () => {
    // Both on 5 dogs, so the salon's (sortOrder, code) order decides -
    // a curated sortOrder must survive this sort.
    const tied = [code("Zebra", null, 5), code("Aardvark", null, 5)];
    expect(codesOf(searchPetCodes(tied, ""))).toEqual(["Zebra", "Aardvark"]);
  });

  it("treats a missing or null count as nobody carrying it", () => {
    const sparse = [code("Unknown", null, undefined), code("Nulled", null, null), code("Counted", null, 3)];
    expect(codesOf(searchPetCodes(sparse, "")).at(0)).toBe("Counted");
    expect(searchPetCodes(sparse, "")).toHaveLength(3);
  });

  it("marks resting entries as matching nothing, since nothing was typed", () => {
    expect(searchPetCodes(CATALOGUE, "").every((h) => h.matchedOn === null)).toBe(true);
  });
});

describe("searchPetCodes — ranking what was typed", () => {
  it("puts an exact code above one that merely starts with it", () => {
    // "#3" and "#3 PFFT" are different blades. Typing the whole of one of
    // them must not offer the other first.
    expect(codesOf(searchPetCodes(CATALOGUE, "#3"))).toEqual(["#3", "#3 PFFT"]);
  });

  it("does not drag in a code whose DESCRIPTION merely contains the letters", () => {
    // "No cologne" is described as "Owner asks for no cologne", and "Ow-ner-"
    // contains the whole query. Three letters against 93 short sentences
    // finds a lot of that, and each false chip pushes the real one down.
    expect(codesOf(searchPetCodes(CATALOGUE, "ner"))).toEqual(["Ner"]);
  });

  it("still allows a mid-token match inside the CODE itself", () => {
    // Codes are shorthand, not prose, so a match inside one is usually the
    // thing being looked for. "mm" is mid-token in "#16mm".
    expect(codesOf(searchPetCodes(CATALOGUE, "mm"))).toEqual(["#16mm"]);
  });

  it("ignores case and surrounding space", () => {
    expect(codesOf(searchPetCodes(CATALOGUE, "  PLUCK  "))).toEqual(["PLUCK EARS"]);
  });

  it("drops everything that does not match", () => {
    expect(searchPetCodes(CATALOGUE, "zzzz")).toEqual([]);
  });

  it("breaks a rank tie by how many dogs carry the code", () => {
    // All three descriptions start with "Blade", so rank cannot separate
    // them and the blade 58 dogs are on wins over the one 2 dogs are on.
    expect(codesOf(searchPetCodes(CATALOGUE, "blade"))).toEqual(["#5f", "#3", "#3 PFFT"]);
  });
});

describe("searchPetCodes — searching the description", () => {
  it("finds a code by what it means, not just by its name", () => {
    // The whole reason the description is searched: nobody looking for the
    // nervous-dog code guesses it is spelled "Ner".
    const hits = searchPetCodes(CATALOGUE, "nervous");
    expect(codesOf(hits)).toEqual(["Ner"]);
  });

  it("says the description is what matched, so the chip is not a mystery", () => {
    const [hit] = searchPetCodes(CATALOGUE, "bitten");
    expect(hit.entry.code).toBe("Bites");
    expect(hit.matchedOn).toBe("description");
  });

  it("credits the code when the code itself matched", () => {
    const [hit] = searchPetCodes(CATALOGUE, "muzzle");
    expect(hit.matchedOn).toBe("code");
  });

  it("credits the code on a draw, because the chip shows the code", () => {
    // "pluck" is a prefix of the code AND of the description; the chip
    // reads "PLUCK EARS", which explains itself without a why.
    const [hit] = searchPetCodes(CATALOGUE, "pluck");
    expect(hit.matchedOn).toBe("code");
  });

  it("copes with a null description", () => {
    const sparse = [code("Plain", null, 1)];
    expect(codesOf(searchPetCodes(sparse, "plain"))).toEqual(["Plain"]);
    expect(searchPetCodes(sparse, "anything")).toEqual([]);
  });
});

describe("searchPetCodes — typed input is not a pattern", () => {
  it("does not throw on regex metacharacters", () => {
    // Staff type freely into this box. The ranking builds a RegExp from the
    // needle, so an unescaped "(" would take the whole panel down.
    for (const nasty of ["(", ")", "[", "*", "+", "?", "$", "^", "\\", "a(b", "#5f)"]) {
      expect(() => searchPetCodes(CATALOGUE, nasty)).not.toThrow();
    }
  });

  it("treats a metacharacter as the literal character", () => {
    const literal = [code("Size (big)", "Large dog", 3), code("Size big", "No brackets", 3)];
    expect(codesOf(searchPetCodes(literal, "(big)"))).toEqual(["Size (big)"]);
  });
});

describe("isNewCode", () => {
  it("is false for a code the salon already has, whatever the casing", () => {
    expect(isNewCode(CATALOGUE, "#5f")).toBe(false);
    expect(isNewCode(CATALOGUE, "MUZZLE")).toBe(false);
    expect(isNewCode(CATALOGUE, "  Ner  ")).toBe(false);
  });

  it("is true for something nobody has typed before", () => {
    expect(isNewCode(CATALOGUE, "No nails")).toBe(true);
  });

  it("is false for an empty box, which is not about to add anything", () => {
    expect(isNewCode(CATALOGUE, "")).toBe(false);
    expect(isNewCode(CATALOGUE, "   ")).toBe(false);
  });

  it("is not satisfied by a partial match", () => {
    // "#3" exists, "#3 P" does not - pressing Add would create it.
    expect(isNewCode(CATALOGUE, "#3 P")).toBe(true);
  });
});

describe("RESTING_CODE_LIMIT", () => {
  it("leaves the Add box on screen, so it is smaller than the vocabulary", () => {
    // 93 codes in the real salon; the point of the cap is that the panel
    // does not open on a wall of chips.
    expect(RESTING_CODE_LIMIT).toBeLessThan(93);
    expect(RESTING_CODE_LIMIT).toBeGreaterThan(5);
  });
});
