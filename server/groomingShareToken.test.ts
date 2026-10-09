import { describe, expect, it } from "vitest";
import {
  GROOMING_SHARE_TOKEN_LENGTH,
  buildGroomingShareToken,
  groomingShareUrl,
  isGroomingShareToken,
} from "@shared/groomingShareToken";

const bytes = (fill: (index: number) => number, length = 32) =>
  Uint8Array.from({ length }, (_, index) => fill(index));

describe("buildGroomingShareToken", () => {
  it("is the documented length", () => {
    expect(buildGroomingShareToken(bytes(() => 0))).toHaveLength(GROOMING_SHARE_TOKEN_LENGTH);
  });

  it("never emits the letters that misread down the phone", () => {
    // Every byte value maps somewhere; sweep all 256 and check the alphabet.
    for (let start = 0; start < 256; start += 24) {
      const token = buildGroomingShareToken(bytes((index) => (start + index) % 256));
      expect(token).not.toMatch(/[ilou]/);
      expect(token).toMatch(/^[0-9a-z]+$/);
    }
  });

  it("uses the whole alphabet rather than a slice of it", () => {
    // 0..31 covers each symbol once, so a correct mapping produces 24 distinct
    // characters. A bug masking too few bits would repeat.
    const token = buildGroomingShareToken(bytes((index) => index));
    expect(new Set(token).size).toBe(GROOMING_SHARE_TOKEN_LENGTH);
  });

  it("maps a byte by its low 5 bits, so 0 and 32 agree", () => {
    expect(buildGroomingShareToken(bytes(() => 0))).toBe(buildGroomingShareToken(bytes(() => 32)));
  });

  it("refuses to build from too little randomness", () => {
    expect(() => buildGroomingShareToken(bytes(() => 7, 8))).toThrow(/at least 24 bytes/i);
  });
});

describe("isGroomingShareToken", () => {
  it("accepts a token it just built", () => {
    expect(isGroomingShareToken(buildGroomingShareToken(bytes((index) => index * 7)))).toBe(true);
  });

  it("rejects the junk a public route actually receives", () => {
    for (const junk of ["", null, undefined, "favicon.ico", "../../etc/passwd", "1", "a".repeat(64)]) {
      expect(isGroomingShareToken(junk)).toBe(false);
    }
  });

  it("rejects a right-length string containing an excluded letter", () => {
    // Guards the lookalike rule: swapping one character for "o" must not pass.
    const valid = buildGroomingShareToken(bytes((index) => index));
    expect(isGroomingShareToken(`o${valid.slice(1)}`)).toBe(false);
  });
});

describe("groomingShareUrl", () => {
  it("builds the client-facing link", () => {
    expect(groomingShareUrl("https://staff.barkinbeautiful.com.au", "abc")).toBe(
      "https://staff.barkinbeautiful.com.au/card/abc",
    );
  });

  it("does not double the slash when the base URL has a trailing one", () => {
    expect(groomingShareUrl("https://staff.barkinbeautiful.com.au/", "abc")).toBe(
      "https://staff.barkinbeautiful.com.au/card/abc",
    );
  });
});
