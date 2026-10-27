import { describe, it, expect } from "vitest";
import {
  properFirstName,
  properLastName,
  properName,
  isParticleSurname,
} from "../shared/personName";

describe("properFirstName", () => {
  it("capitalises a lowercase name", () => {
    expect(properFirstName("jo")).toBe("Jo");
    expect(properFirstName("marjorie")).toBe("Marjorie");
  });

  it("leaves a correct name alone", () => {
    expect(properFirstName("Jo")).toBe("Jo");
  });

  it("trims what a phone keyboard leaves behind", () => {
    expect(properFirstName("  jo ")).toBe("Jo");
  });

  it("survives null and empty", () => {
    expect(properFirstName(null)).toBe("");
    expect(properFirstName(undefined)).toBe("");
    expect(properFirstName("")).toBe("");
  });

  it("does not touch anything but the first character", () => {
    // Shouting is not a typo to fix, and lowering it would be a guess.
    expect(properFirstName("JO")).toBe("JO");
    expect(properFirstName("jO")).toBe("JO");
  });
});

describe("properLastName", () => {
  it("capitalises a lowercase surname", () => {
    expect(properLastName("roberts")).toBe("Roberts");
  });

  /**
   * The whole reason this is first-letter-only. Title-casing would give
   * Mcewan, O'brien and Macdonald, breaking three names that arrived
   * correct in order to fix one that did not.
   */
  it("never damages an internal capital", () => {
    expect(properLastName("McEwan")).toBe("McEwan");
    expect(properLastName("O'Brien")).toBe("O'Brien");
    expect(properLastName("MacDonald")).toBe("MacDonald");
    expect(properLastName("van der Berg")).toBe("van der Berg");
  });

  it("leaves a particle surname as the person typed it", () => {
    expect(properLastName("de Beer")).toBe("de Beer");
    expect(properLastName("van Wyk")).toBe("van Wyk");
    expect(properLastName("de silva")).toBe("de silva");
  });

  it("still capitalises a surname that merely starts with those letters", () => {
    // "Dean" opens with "de" and is not a particle — the particle needs a
    // separator after it, or every D-name would be held back.
    expect(properLastName("dean")).toBe("Dean");
    expect(properLastName("vance")).toBe("Vance");
    expect(properLastName("alcock")).toBe("Alcock");
  });
});

describe("properName", () => {
  it("fixes a first name even when the surname is held back", () => {
    expect(properName({ firstName: "sjani", lastName: "de Beer" })).toEqual({
      firstName: "Sjani",
      lastName: "de Beer",
    });
  });

  it("fixes both halves", () => {
    expect(properName({ firstName: "lauren", lastName: "forword" })).toEqual({
      firstName: "Lauren",
      lastName: "Forword",
    });
  });
});

describe("isParticleSurname", () => {
  it("recognises the ones a human has to decide", () => {
    expect(isParticleSurname("van wyk")).toBe(true);
    expect(isParticleSurname("de Roo")).toBe(true);
    expect(isParticleSurname("Dean")).toBe(false);
    expect(isParticleSurname(null)).toBe(false);
  });
});
