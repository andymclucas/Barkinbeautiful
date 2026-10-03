import { describe, expect, it } from "vitest";
import { greetingForHour } from "../shared/greeting";

describe("greetingForHour", () => {
  it("greets the morning up to noon", () => {
    expect(greetingForHour(0)).toBe("Good morning");
    expect(greetingForHour(7)).toBe("Good morning");
    expect(greetingForHour(11)).toBe("Good morning");
  });

  it("switches at noon", () => {
    // The bug: 2:20pm on the salon screen still read "Good morning".
    expect(greetingForHour(12)).toBe("Good afternoon");
    expect(greetingForHour(14)).toBe("Good afternoon");
    expect(greetingForHour(17)).toBe("Good afternoon");
  });

  it("switches at six", () => {
    expect(greetingForHour(18)).toBe("Good evening");
    expect(greetingForHour(23)).toBe("Good evening");
  });

  it("falls back rather than greeting an unreadable hour", () => {
    expect(greetingForHour(24)).toBe("Hello");
    expect(greetingForHour(-1)).toBe("Hello");
    expect(greetingForHour(NaN)).toBe("Hello");
    expect(greetingForHour(9.5)).toBe("Hello");
  });
});
