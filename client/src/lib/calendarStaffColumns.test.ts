import { describe, expect, it } from "vitest";
import { bookingStaffId } from "./calendarStaffColumns";

describe("bookingStaffId", () => {
  it("saves a booking started in the Daycare column with nobody against it", () => {
    expect(bookingStaffId("__unassigned__")).toBeUndefined();
  });
  it("saves no groomer when none was picked", () => {
    expect(bookingStaffId("")).toBeUndefined();
    expect(bookingStaffId(undefined)).toBeUndefined();
  });
  it("never sends something that is not a real id", () => {
    expect(bookingStaffId("abc")).toBeUndefined();
    expect(bookingStaffId("-100")).toBeUndefined();
  });
  it("passes a real groomer through", () => {
    expect(bookingStaffId("60001")).toBe(60001);
  });
});
