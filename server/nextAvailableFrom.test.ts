import { describe, expect, it } from "vitest";
import { nextAvailableFrom } from "@shared/nextAvailableFrom";

describe("nextAvailableFrom", () => {
  it("starts from the day on screen when it is ahead — Lauren looking at January", () => {
    expect(nextAvailableFrom("2027-01-12", "2026-11-11")).toBe("2027-01-12");
  });

  it("never starts in the past", () => {
    expect(nextAvailableFrom("2026-11-02", "2026-11-11")).toBe("2026-11-11");
  });

  it("falls back to today with nothing usable on screen", () => {
    expect(nextAvailableFrom(null, "2026-11-11")).toBe("2026-11-11");
    expect(nextAvailableFrom("12/01/2027", "2026-11-11")).toBe("2026-11-11");
  });
});
