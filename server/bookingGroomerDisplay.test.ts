import { describe, expect, it } from "vitest";
import { getBookingGroomerDisplayName } from "../shared/bookingGroomerDisplay";

describe("booking groomer display name", () => {
  it("uses only the groomer's first name in the customer-facing picker", () => {
    expect(getBookingGroomerDisplayName("Megs Graham")).toBe("Megs");
    expect(getBookingGroomerDisplayName("  Charlotte   Purcell ")).toBe("Charlotte");
  });
});
