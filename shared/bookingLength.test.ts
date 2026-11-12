import { describe, expect, it } from "vitest";
import { bookingLengthProblem } from "./bookingLength";

describe("a booking's start and end", () => {
  it("accepts an ordinary groom", () => {
    expect(bookingLengthProblem("2027-01-15T07:30", "2027-01-15T08:30")).toBeNull();
    expect(bookingLengthProblem("2027-01-15T07:30", "2027-01-15T15:30")).toBeNull();
  });

  it("refuses Gizmo's year-long booking — the End date typed as 2028", () => {
    expect(bookingLengthProblem("2027-01-15T07:30", "2028-01-15T08:30")).toContain("check the End date");
  });

  it("refuses an end before or at the start, and nonsense", () => {
    expect(bookingLengthProblem("2027-01-15T08:30", "2027-01-15T07:30")).toContain("before the start");
    expect(bookingLengthProblem("2027-01-15T08:30", "2027-01-15T08:30")).toContain("before the start");
    expect(bookingLengthProblem("garbage", "2027-01-15T08:30")).toContain("isn't a real");
  });
});
