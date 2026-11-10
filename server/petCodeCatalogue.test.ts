import { describe, it, expect } from "vitest";
import { indexPetCodes, meaningFor, colourFor, describeFromCatalogue } from "../shared/petCodeCatalogue";

const CATALOGUE = [
  { code: "SENSITIVE", description: "Nervous — go slowly", colourHex: "#b45309" },
  { code: "✂5f", description: "#5f blade", colourHex: null },
  { code: "NEWCODE", description: null, colourHex: "#7c3aed" },
];

describe("meaningFor", () => {
  const idx = indexPetCodes(CATALOGUE);

  it("prefers the salon's own description", () => {
    expect(meaningFor("SENSITIVE", idx)).toBe("Nervous — go slowly");
  });

  it("matches however the code is cased or spaced", () => {
    // "sensitive" and "SENSITIVE" are one code, not two.
    for (const v of ["sensitive", " SENSITIVE ", "Sensitive"]) {
      expect(meaningFor(v, idx), v).toBe("Nervous — go slowly");
    }
  });

  it("falls back to the hardcoded map for a code not yet in the catalogue", () => {
    // A salon that has not seeded its catalogue must not suddenly see
    // less than it did before the table existed.
    expect(meaningFor("PITA", indexPetCodes([]))).toBeTruthy();
  });

  it("falls back when the catalogue row has no description", () => {
    // "✂4f" expands to "#4f blade" in the hardcoded map. Note "#7f" would
    // NOT work here: its mapped meaning is literally "#7f", and
    // petCodeMeaning returns null for that on purpose rather than
    // rendering "#7f — #7f".
    expect(meaningFor("✂4f", indexPetCodes([{ code: "✂4f", description: "  " }]))).toBe("#4f blade");
  });

  it("returns null for a code nobody has ever explained", () => {
    expect(meaningFor("ZZZ-INVENTED", idx)).toBeNull();
  });
});

describe("colourFor", () => {
  const idx = indexPetCodes(CATALOGUE);

  it("uses the colour the salon picked", () => {
    expect(colourFor("SENSITIVE", idx)).toBe("#b45309");
  });

  it("returns null when none is set, so the default chip is used", () => {
    expect(colourFor("✂5f", idx)).toBeNull();
    expect(colourFor("unknown", idx)).toBeNull();
  });

  it("ignores a malformed colour rather than emitting broken CSS", () => {
    // An invalid value in a style attribute is silently dropped by the
    // browser, which looks like the feature not working.
    const bad = indexPetCodes([{ code: "X", colourHex: "not-a-colour" }]);
    expect(colourFor("X", bad)).toBeNull();
  });
});

describe("describeFromCatalogue", () => {
  const idx = indexPetCodes(CATALOGUE);

  it("joins the badge and its meaning", () => {
    expect(describeFromCatalogue("SENSITIVE", idx)).toBe("SENSITIVE — Nervous — go slowly");
  });

  it("shows the badge alone when nothing is known", () => {
    expect(describeFromCatalogue("ZZZ-INVENTED", idx)).toBe("ZZZ-INVENTED");
  });
});

describe("indexPetCodes", () => {
  it("drops a nameless row", () => {
    expect(indexPetCodes([{ code: "  " }, { code: "A" }]).size).toBe(1);
  });
});

describe("badge text colour (11/11/2026)", () => {
  it("uses the salon's choice when it made one", async () => {
    const { badgeTextColour, textColourFor } = await import("../shared/petCodeCatalogue");
    const { readableTextOn } = await import("../shared/readableTextOn");
    const idx = indexPetCodes([{ code: "No cologne", colourHex: "#ff0000", textColourHex: "#ffffff" }]);
    expect(textColourFor("no cologne", idx)).toBe("#ffffff");
    expect(badgeTextColour("#ff0000", textColourFor("No cologne", idx), readableTextOn)).toBe("#ffffff");
  });

  it("falls back to automatic, which picks black on pure red — the case Andy found hard to read", async () => {
    const { badgeTextColour } = await import("../shared/petCodeCatalogue");
    const { readableTextOn, DARK_TEXT } = await import("../shared/readableTextOn");
    expect(badgeTextColour("#ff0000", null, readableTextOn)).toBe(DARK_TEXT);
    expect(badgeTextColour("#ff0000", "not-a-colour", readableTextOn)).toBe(DARK_TEXT);
  });
});
