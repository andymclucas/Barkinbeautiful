import { describe, it, expect } from "vitest";
import { shortAddOnLabel, describeAddOns } from "../shared/addOnBoardLabel";

/** The salon's live add-on catalogue on 22/10/2026, verbatim. */
const CATALOGUE = [
  "Styled Cut Upgrade (add onto any Classic cut)",
  "Matting / Overgrown Fur De-matt (9+ weeks overdue)",
  "Teeth Ultra Clean + Anal Gland Pack ",   // note: trailing space, as stored
  "Pick Up or Delivery (each way)",
  "Extra Care",
  "Daycare (per session)",
  "Anal Glands",
  "Nail Painting",
  "Teeth Ultra Clean",
  "Colour / Dye",
  "Teeth Brushing",
  "Flea Rinse",
  "ASAP Surcharge",
];

describe("shortAddOnLabel", () => {
  it("has a short form for every add-on the salon actually sells", () => {
    // A name with no mapping falls back to three words, which for this
    // catalogue would be wrong often enough to be worth pinning.
    for (const name of CATALOGUE) {
      const short = shortAddOnLabel(name);
      expect(short.length, `${name} -> ${short}`).toBeLessThanOrEqual(16);
      expect(short).not.toContain("…");
    }
  });

  it("copes with the trailing space one catalogue row actually has", () => {
    expect(shortAddOnLabel("Teeth Ultra Clean + Anal Gland Pack ")).toBe("Teeth + glands");
  });

  it("keeps the two teeth services apart", () => {
    // A groomer doing the wrong one costs the salon $30 and the client a
    // service they did not get.
    expect(shortAddOnLabel("Teeth Ultra Clean")).toBe("Teeth ultra");
    expect(shortAddOnLabel("Teeth Brushing")).toBe("Teeth");
    expect(shortAddOnLabel("Teeth Ultra Clean")).not.toBe(shortAddOnLabel("Teeth Brushing"));
  });

  it("gives every catalogue entry a distinct badge", () => {
    const shorts = CATALOGUE.map(shortAddOnLabel);
    expect(new Set(shorts).size).toBe(CATALOGUE.length);
  });

  it("matches regardless of case, punctuation or spacing", () => {
    for (const variant of ["anal glands", "ANAL GLANDS", "Anal  Glands", " Anal-Glands "]) {
      expect(shortAddOnLabel(variant), variant).toBe("Glands");
    }
  });

  it("still shows something for an add-on nobody has shortened yet", () => {
    // A new catalogue entry must appear on the board the day it is made,
    // not wait for someone to update this file.
    expect(shortAddOnLabel("Blueberry Facial")).toBe("Blueberry Facial");
    const long = shortAddOnLabel("Deluxe Hydrating Spa Treatment For Double Coats");
    expect(long.length).toBeLessThanOrEqual(18);
    expect(long).toContain("…");
  });

  it("never renders an empty badge", () => {
    for (const nothing of [null, undefined, "", "   "]) {
      expect(shortAddOnLabel(nothing)).toBe("Add-on");
    }
  });
});

describe("describeAddOns", () => {
  it("lists them in full, with quantities above one", () => {
    expect(describeAddOns([
      { name: "Teeth Ultra Clean" },
      { name: "Anal Glands", quantity: 2 },
    ])).toBe("Teeth Ultra Clean, Anal Glands ×2");
  });

  it("is empty for a dog with no extras", () => {
    expect(describeAddOns([])).toBe("");
    expect(describeAddOns(null)).toBe("");
    expect(describeAddOns(undefined)).toBe("");
  });

  it("drops a nameless row rather than printing a stray comma", () => {
    expect(describeAddOns([{ name: "Glands" }, { name: "  " }])).toBe("Glands");
  });
});
