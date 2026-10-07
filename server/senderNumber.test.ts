import { describe, expect, it } from "vitest";
import { isUsableSenderNumber, pickSenderNumber } from "@shared/senderNumber";

describe("the value that broke the salon's SMS", () => {
  it("rejects the placeholder that was actually in the database", () => {
    // tenants.twilio_number held exactly this on 06/10/2026, and every
    // outbound message failed for a day and a half.
    expect(isUsableSenderNumber("+61...")).toBe(false);
  });

  it("rejects the other things somebody types into that field", () => {
    for (const value of ["", "   ", "TBC", "n/a", "+61", "+", "...", "+61 xxx xxx xxx", "0438 603 451"]) {
      expect(isUsableSenderNumber(value)).toBe(false);
    }
  });

  it("rejects an alphanumeric sender ID, on purpose", () => {
    // Twilio would accept "BarkinBeau" — but accepting names is what let
    // "TBC" and "n/a" through, and this salon sends from a mobile. An
    // alphanumeric sender is a deliberate feature for another day.
    expect(isUsableSenderNumber("BarkinBeau")).toBe(false);
  });

  it("rejects nothing at all", () => {
    expect(isUsableSenderNumber(null)).toBe(false);
    expect(isUsableSenderNumber(undefined)).toBe(false);
  });
});

describe("numbers that can actually send", () => {
  it("accepts a real Australian mobile in E.164", () => {
    expect(isUsableSenderNumber("+61438603451")).toBe(true);
  });

  it("accepts other countries, because this is not a dialling-plan check", () => {
    expect(isUsableSenderNumber("+14155552671")).toBe(true);
    expect(isUsableSenderNumber("+442071838750")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isUsableSenderNumber("  +61438603451  ")).toBe(true);
  });

  it("rejects a mobile typed without its country code", () => {
    // "0438603451" is how an Australian writes it, and sending from it
    // would fail exactly as "+61..." did.
    expect(isUsableSenderNumber("0438603451")).toBe(false);
  });
});

describe("choosing between candidates", () => {
  it("prefers the salon's own number", () => {
    expect(pickSenderNumber("+61400000001", "+61400000002")).toBe("+61400000001");
  });

  it("skips an unusable one instead of stopping at it", () => {
    // The whole bug in one line: the salon's column held junk, and the
    // shared number that worked was never reached.
    expect(pickSenderNumber("+61...", "+61438603451")).toBe("+61438603451");
    expect(pickSenderNumber(null, "+61438603451")).toBe("+61438603451");
    expect(pickSenderNumber("", "   ", "+61438603451")).toBe("+61438603451");
  });

  it("returns null when nothing can send, rather than something that cannot", () => {
    expect(pickSenderNumber("+61...", "", null, undefined)).toBeNull();
    expect(pickSenderNumber()).toBeNull();
  });
});
