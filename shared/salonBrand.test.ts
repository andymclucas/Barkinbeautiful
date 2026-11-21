import { describe, expect, it } from "vitest";
import { salonInitials, salonLogoSrc, salonName } from "./salonBrand";

describe("salonName", () => {
  it("uses the salon's own name, trimmed", () => {
    expect(salonName({ name: "  Paws & Co  " })).toBe("Paws & Co");
  });
  it("falls back when there is no name yet", () => {
    expect(salonName(undefined)).toBe("Your salon");
    expect(salonName({ name: "   " }, "the salon")).toBe("the salon");
  });
});

describe("salonLogoSrc", () => {
  it("returns the uploaded logo", () => {
    expect(salonLogoSrc({ logoUrl: "/api/salon-logo?key=salon-branding%2Flogos%2Fa.png" }))
      .toBe("/api/salon-logo?key=salon-branding%2Flogos%2Fa.png");
  });
  it("returns null rather than another salon's picture when none is uploaded", () => {
    expect(salonLogoSrc({ logoUrl: null })).toBeNull();
    expect(salonLogoSrc({ logoUrl: " " })).toBeNull();
    expect(salonLogoSrc(null)).toBeNull();
  });
});

describe("salonInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(salonInitials("Barkin Beautiful")).toBe("BB");
    expect(salonInitials("Barkin' Beautiful Grooming Studio")).toBe("BB");
    expect(salonInitials("paws")).toBe("P");
  });
  it("is empty for no name", () => {
    expect(salonInitials(undefined)).toBe("");
  });
});
