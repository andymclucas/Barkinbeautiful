import { describe, it, expect } from "vitest";
import { calculateSmsCost, isGsm7 } from "../shared/smsSegments";

describe("calculateSmsCost", () => {
  it("costs nothing for an empty message", () => {
    expect(calculateSmsCost("")).toMatchObject({ segments: 0, length: 0, forcedUnicode: false });
  });

  it("fits 160 plain characters in one segment", () => {
    const c = calculateSmsCost("a".repeat(160));
    expect(c).toMatchObject({ encoding: "GSM-7", segments: 1, remainingInSegment: 0 });
  });

  it("splits at 161 into two segments of 153", () => {
    expect(calculateSmsCost("a".repeat(161)).segments).toBe(2);
  });

  it("charges GSM extended characters twice", () => {
    // "{" needs an escape, so 80 of them fill 160 units - still one segment.
    expect(calculateSmsCost("{".repeat(80))).toMatchObject({ length: 160, segments: 1 });
    expect(calculateSmsCost("{".repeat(81)).segments).toBe(2);
  });

  it("drops to UCS-2 and 70 characters as soon as an emoji appears", () => {
    const plain = calculateSmsCost("a".repeat(100));
    expect(plain).toMatchObject({ encoding: "GSM-7", segments: 1 });

    const withEmoji = calculateSmsCost("a".repeat(100) + "\u{1F436}");
    expect(withEmoji.encoding).toBe("UCS-2");
    expect(withEmoji.forcedUnicode).toBe(true);
    // The same text that cost one segment now costs two.
    expect(withEmoji.segments).toBeGreaterThan(plain.segments);
  });

  it("counts an emoji as two UTF-16 units, because it is a surrogate pair", () => {
    expect(calculateSmsCost("\u{1F436}")).toMatchObject({ encoding: "UCS-2", length: 2, segments: 1 });
  });

  it("fits 70 UCS-2 units in one segment and 71 in two", () => {
    expect(calculateSmsCost("é".repeat(70) + "\u{1F436}".slice(0, 0) + "©".repeat(0)).encoding).toBe("GSM-7");
    // "©" is not in GSM-7, so this is genuinely UCS-2.
    expect(calculateSmsCost("©".repeat(70))).toMatchObject({ encoding: "UCS-2", segments: 1 });
    expect(calculateSmsCost("©".repeat(71)).segments).toBe(2);
  });

  it("keeps a normal salon reminder at one segment", () => {
    const c = calculateSmsCost("Hi Jane, just confirming Bella's groom tomorrow at 9:30am. Barkin' Beautiful");
    expect(c).toMatchObject({ encoding: "GSM-7", segments: 1 });
  });
});

describe("isGsm7", () => {
  it("accepts the characters a salon actually types", () => {
    expect(isGsm7("Hi Jane - Bella's 9:30am groom is confirmed. $85. Thanks!")).toBe(true);
  });

  it("rejects emoji and smart quotes", () => {
    expect(isGsm7("Thanks \u{1F436}")).toBe(false);
    expect(isGsm7("Bella’s groom")).toBe(false); // curly apostrophe
  });
});
