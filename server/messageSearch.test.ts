import { describe, it, expect } from "vitest";
import { MIN_MESSAGE_SEARCH_LENGTH, likePattern, parseMessageSearch } from "@shared/messageSearch";

describe("parseMessageSearch", () => {
  it("does nothing for an empty or one-character box", () => {
    for (const raw of ["", "   ", null, undefined, "a"]) {
      expect(parseMessageSearch(raw as any)).toMatchObject({ active: false, phoneDigits: null });
    }
    expect(MIN_MESSAGE_SEARCH_LENGTH).toBe(2);
  });

  it("recognises an Australian mobile however it is written", () => {
    // Every one of these is Andy's number. The last nine digits are the
    // only part they all share, which is why that is what gets matched.
    for (const raw of ["0427030788", "0427 030 788", "+61427030788", "+61 427 030 788", "61427030788"]) {
      expect(parseMessageSearch(raw).phoneDigits, raw).toBe("427030788");
    }
  });

  it("searches on a partial number, for somebody reading a missed call", () => {
    expect(parseMessageSearch("0427").phoneDigits).toBe("0427");
    expect(parseMessageSearch("030788").phoneDigits).toBe("030788");
  });

  it("treats a name as a name, not a number", () => {
    for (const raw of ["Harvey", "Sonia Condon", "McLucas"]) {
      expect(parseMessageSearch(raw).phoneDigits, raw).toBeNull();
    }
  });

  it("does not turn a sentence into a phone search because it has a digit", () => {
    // "cut 2 nails" is somebody searching message text. Reading it as a
    // number would search for nothing and look broken.
    expect(parseMessageSearch("cut 2 nails").phoneDigits).toBeNull();
    expect(parseMessageSearch("back on the 15th").phoneDigits).toBeNull();
  });

  it("keeps the text for every search, number or not", () => {
    expect(parseMessageSearch("  Harvey  ").text).toBe("Harvey");
    expect(parseMessageSearch("0427 030 788").text).toBe("0427 030 788");
  });
});

describe("likePattern", () => {
  it("wraps the term in wildcards", () => {
    expect(likePattern("Harvey")).toBe("%Harvey%");
  });

  it("escapes the wildcards SQL would otherwise act on", () => {
    // "100%" would match almost everything, and "_" matches any single
    // character — neither is what somebody typing them means.
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
    expect(likePattern("back\\slash")).toBe("%back\\\\slash%");
  });
});
