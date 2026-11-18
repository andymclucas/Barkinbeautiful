import { describe, expect, it } from "vitest";
import { moveAsksAboutText } from "./moveTextQuestion";

const now = new Date("2026-11-18T20:40:00.000Z"); // Thu 19 Nov, 6:40 am Brisbane
const today1230 = new Date("2026-11-19T02:30:00.000Z"); // Thu 19 Nov, 12:30 pm Brisbane

describe("moveAsksAboutText", () => {
  it("asks when the booking goes to another day", () => {
    expect(moveAsksAboutText({ previousStart: today1230, newStartLocal: "2026-11-20T12:30", now })).toBe(true);
  });

  it("does not ask for a new time on the same day, which never texts", () => {
    expect(moveAsksAboutText({ previousStart: today1230, newStartLocal: "2026-11-19T14:00", now })).toBe(false);
  });

  it("goes by the Brisbane day, not the UTC one", () => {
    // 7:00 am Brisbane on the 20th is still the 19th in UTC.
    const early = new Date("2026-11-19T21:00:00.000Z");
    expect(moveAsksAboutText({ previousStart: early, newStartLocal: "2026-11-20T15:00", now })).toBe(false);
    expect(moveAsksAboutText({ previousStart: today1230, newStartLocal: "2026-11-20T07:00", now })).toBe(true);
  });

  it("does not ask when the new time has already passed, or is not a time", () => {
    expect(moveAsksAboutText({ previousStart: today1230, newStartLocal: "2026-11-17T12:30", now })).toBe(false);
    expect(moveAsksAboutText({ previousStart: today1230, newStartLocal: "", now })).toBe(false);
  });
});
