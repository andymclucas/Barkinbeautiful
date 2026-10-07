import { describe, expect, it } from "vitest";
import { bandFromBreed, normaliseBreed, DELIBERATELY_UNMAPPED } from "@shared/breedSize";

describe("breeds that sit clearly inside one band", () => {
  it("places the toys as small", () => {
    for (const breed of ["Pomeranian", "Maltese", "Papillon", "Shih Tzu", "Pug", "Poodle (Toy)"]) {
      expect(bandFromBreed(breed)).toBe("small");
    }
  });

  it("places the retrievers and shepherds as extra large", () => {
    for (const breed of ["Labrador", "Retriever (Golden)", "German Shepherd Dog"]) {
      expect(bandFromBreed(breed)).toBe("extra_large");
    }
  });

  it("places a Bernese as giant", () => {
    expect(bandFromBreed("Bernese Mountain Dog")).toBe("giant");
  });

  it("reads the salon's own spellings", () => {
    // Taken from the pets table: these are how they are actually typed.
    expect(bandFromBreed("Labradore")).toBe("extra_large");
    expect(bandFromBreed("Havenese")).toBe("small");
    expect(bandFromBreed("Dachshund (Kaninchen Long Haired)")).toBe("small");
    expect(bandFromBreed("Malt X Shih")).toBe("small");
  });

  it("does not care about case, spacing or punctuation", () => {
    expect(bandFromBreed("  POODLE   (TOY)  ")).toBe("small");
    expect(bandFromBreed("shih-tzu")).toBe("small");
    expect(normaliseBreed("Retriever (Golden)")).toBe("retriever golden");
  });
});

describe("breeds it refuses", () => {
  it("refuses every breed that straddles two of the salon's bands", () => {
    // The bands are narrow — small is 0-10 kg and small-medium 11-13 — so a
    // Border Collie at 14-20 kg is medium OR large, and which one is a real
    // difference in chair time and in that groomer's target.
    for (const breed of DELIBERATELY_UNMAPPED) {
      expect(bandFromBreed(breed)).toBeNull();
    }
  });

  it("refuses the doodles, which are whatever the poodle parent was", () => {
    for (const breed of ["Cavoodle", "Spoodle", "Moodle", "Schnoodle", "Labradoodle - MINI", "Groodle"]) {
      expect(bandFromBreed(breed)).toBeNull();
    }
  });

  it("refuses a cross even when one parent is mapped", () => {
    // "Mastiff X" could be anything.
    expect(bandFromBreed("Mastiff X")).toBeNull();
    expect(bandFromBreed("Cattle X Kelpie")).toBeNull();
    expect(bandFromBreed("greyhound x")).toBeNull();
  });

  it("refuses nothing-at-all rather than assuming small", () => {
    // An unknown breed and a placeholder record must not become a small dog.
    for (const breed of [null, undefined, "", "   ", "Unknown Dog", "Preview validation only"]) {
      expect(bandFromBreed(breed as any)).toBeNull();
    }
  });
});
