import { describe, expect, it } from "vitest";
import { looksLikeCardNumber } from "@shared/cardNumberDetect";

describe("spotting a card number in a client note", () => {
  it("catches the ones in the salon's MoeGo notes", () => {
    // Real notes, found on 09/10/2026. Long expired, but they must not be
    // copied into a second system.
    expect(looksLikeCardNumber("4072 2090 1392 8116  exp 0516  3 digits456")).toBe(true);
    expect(looksLikeCardNumber("5313 5566 1204 4372 ex 0716 sec 160*")).toBe(true);
    expect(looksLikeCardNumber("4349680004418118 exp 01/17 sec 645 mobile dog")).toBe(true);
  });

  it("leaves ordinary notes alone", () => {
    // Skipping a harmless note helps nobody, so a bare run of digits is not
    // enough — it has to pass Luhn and start like a real scheme.
    expect(looksLikeCardNumber("Kerri Middleton - 0421 801 761")).toBe(false);
    expect(looksLikeCardNumber("HAS $50 VOUCHER WHICH I QUOTED IS FOR BB AND NAILS")).toBe(false);
    expect(looksLikeCardNumber("Sarah Gibson 0412 905 907 DOG BITES VERY HARD.")).toBe(false);
    expect(looksLikeCardNumber("no mobile")).toBe(false);
    expect(looksLikeCardNumber("")).toBe(false);
    expect(looksLikeCardNumber(null)).toBe(false);
  });

  it("does not trip on a long reference that fails Luhn", () => {
    expect(looksLikeCardNumber("ref 1234567890123456")).toBe(false);
  });
});

describe("not mistaking a list of phone numbers for a card", () => {
  it("leaves notes that are several phone numbers alone", () => {
    // Real notes. Chaining digits across "0412 345 678" style groups was
    // flagging these, and the first one's opening word is BANNED.
    expect(looksLikeCardNumber("BANNED\n\nKevin Anderson - 0412 3456\nCarol Owen - 0412 34")).toBe(false);
    expect(looksLikeCardNumber("0412 905 907 Lester work\nJames 0413 221 118\nMelissa - 0414")).toBe(false);
    expect(looksLikeCardNumber("John Bucknall - 0412 345 678\nlisa- 0498 765 432")).toBe(false);
  });

  it("still catches a card written in eight-four-four", () => {
    // Glenys Tawhai's note is grouped 8-4-4 rather than 4-4-4-4.
    expect(looksLikeCardNumber("45646990 1316 7274 06/19  871")).toBe(true);
  });
});
