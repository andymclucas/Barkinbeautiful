import { describe, expect, it } from "vitest";
import {
  slugifySalonName, checkSlugShape, nextFreeSlug, checkPassword, splitName,
  MIN_PASSWORD_LENGTH,
} from "@shared/salonSignup";

describe("a salon name becomes an address", () => {
  it("handles the ampersand every second salon has in its name", () => {
    // "paws-whiskers" reads like a typo of their own business.
    expect(slugifySalonName("Paws & Whiskers")).toBe("paws-and-whiskers");
    expect(slugifySalonName("Bath & Beyond Dog Spa")).toBe("bath-and-beyond-dog-spa");
  });

  it("folds accents rather than dropping the letter", () => {
    expect(slugifySalonName("Café Canine")).toBe("cafe-canine");
    expect(slugifySalonName("Mädchen Grooming")).toBe("madchen-grooming");
  });

  it("drops apostrophes instead of turning them into hyphens", () => {
    expect(slugifySalonName("Barkin' Beautiful")).toBe("barkin-beautiful");
    expect(slugifySalonName("Jo’s Dog House")).toBe("jos-dog-house");
  });

  it("survives punctuation, spacing and casing", () => {
    expect(slugifySalonName("  THE Dog   House!!  ")).toBe("the-dog-house");
    expect(slugifySalonName("A+ Grooming (Capalaba)")).toBe("a-grooming-capalaba");
  });

  it("never ends on a hyphen, even after truncation", () => {
    const long = slugifySalonName("A".repeat(40) + " " + "B".repeat(40));
    expect(long.length).toBeLessThanOrEqual(63);
    expect(long.endsWith("-")).toBe(false);
  });

  it("gives nothing back for a name with no letters in it", () => {
    expect(slugifySalonName("!!!")).toBe("");
    expect(slugifySalonName("   ")).toBe("");
  });
});

describe("whether an address may be used", () => {
  it("accepts an ordinary one", () => {
    expect(checkSlugShape("paws-and-whiskers")).toBeNull();
  });

  it("refuses the platform's own names", () => {
    // app.groomigo.com must never belong to a salon.
    for (const s of ["app", "api", "admin", "staff", "www", "support"]) {
      expect(checkSlugShape(s), s).toBe("reserved");
    }
  });

  it("refuses what DNS or a reader cannot cope with", () => {
    expect(checkSlugShape("")).toBe("empty");
    expect(checkSlugShape("a")).toBe("too_short");
    expect(checkSlugShape("-leading")).toBe("bad_characters");
    expect(checkSlugShape("has spaces")).toBe("bad_characters");
    expect(checkSlugShape("Has-Capitals")).toBe("bad_characters");
  });

  it("leaves 'taken' to the database, where the answer actually is", () => {
    // Keeping the two apart is what stops a caller forgetting the
    // uniqueness check because the shape check passed.
    expect(checkSlugShape("paws-and-whiskers")).toBeNull();
  });
});

describe("two salons with the same name", () => {
  it("counts rather than appending a random suffix", () => {
    // "pawfection-2" can be read out over the phone. "pawfection-k3x9" cannot.
    expect(nextFreeSlug("pawfection", [])).toBe("pawfection");
    expect(nextFreeSlug("pawfection", ["pawfection"])).toBe("pawfection-2");
    expect(nextFreeSlug("pawfection", ["pawfection", "pawfection-2"])).toBe("pawfection-3");
  });

  it("steps over a reserved base too", () => {
    expect(nextFreeSlug("admin", [])).toBe("admin-2");
  });

  it("keeps the result inside the length limit", () => {
    const long = "a".repeat(63);
    expect(nextFreeSlug(long, [long]).length).toBeLessThanOrEqual(63);
  });
});

describe("passwords", () => {
  it("asks for length rather than symbols", () => {
    // Symbol-and-digit rules push people to Passw0rd! and a sticky note.
    expect(checkPassword("correct horse battery")).toBeNull();
    expect(checkPassword("short")).toBe("too_short");
    // NOT twelve of the same character — that is long and worthless, and
    // the rule below catches it.
    expect(checkPassword("three brown spaniels")).toBeNull();
  });

  it("refuses the handful everybody picks", () => {
    expect(checkPassword("password123")).toBe("too_short");
    expect(checkPassword("Password1234")).toBe("too_common");
    expect(checkPassword("groomigo1234")).toBe("too_common");
  });
});

describe("splitting a typed name", () => {
  it("handles one word, two, and more", () => {
    expect(splitName("Jo")).toEqual({ firstName: "Jo", lastName: "" });
    expect(splitName("Jo Harding")).toEqual({ firstName: "Jo", lastName: "Harding" });
    expect(splitName("  Mary  Anne  van der Berg ")).toEqual({ firstName: "Mary", lastName: "Anne van der Berg" });
    expect(splitName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("passwords people actually choose", () => {
  it("sees through the digits bolted on the end", () => {
    // Listing literals is a losing game — "Password1234" is twelve
    // characters and sails past a list holding "password123".
    for (const p of ["Password1234", "password1234", "Groomigo1234", "letmein12345"]) {
      expect(checkPassword(p), p).toBe("too_common");
    }
    // And the symbol people substitute for a letter, which needs folding
    // back rather than stripping — "pssword" would sail through.
    expect(checkPassword("P@ssword2026")).toBe("too_common");
    expect(checkPassword("p@$$word1234")).toBe("too_common");
  });

  it("rejects long but worthless", () => {
    expect(checkPassword("aaaaaaaaaaaa")).toBe("too_common");
    expect(checkPassword("123456789012")).toBe("too_common");
  });

  it("still allows a real passphrase that happens to contain a weak word", () => {
    // "mypasswordisthedogsname" is fine; only the bare word is not.
    expect(checkPassword("mypasswordisthedogsname")).toBeNull();
    expect(checkPassword("three brown spaniels")).toBeNull();
  });
});
