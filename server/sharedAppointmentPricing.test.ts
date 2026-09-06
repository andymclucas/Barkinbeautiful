import { describe, expect, it } from "vitest";
import { buildSharedAppointmentPriceBreakdown } from "../shared/sharedAppointmentPricing";

describe("shared appointment hover pricing", () => {
  it("shows every pet's price and the combined total for a shared booking", () => {
    const result = buildSharedAppointmentPriceBreakdown([
      { petName: "Ruby", price: "85.00" },
      { petName: "Charlie", price: "70.50" },
    ]);

    expect(result).toMatchObject([
      { petName: "Ruby", formattedAmount: "$85.00", formattedTotal: "$155.50" },
      { petName: "Charlie", formattedAmount: "$70.50", formattedTotal: "$155.50" },
    ]);
  });

  it("retains a valid zero price while flagging only genuinely missing prices", () => {
    const result = buildSharedAppointmentPriceBreakdown([
      { petName: "Ruby", price: "0" },
      { petName: "Charlie", price: null },
    ]);

    expect(result[0]).toMatchObject({ formattedAmount: "$0.00", formattedTotal: null, hasUnpricedPets: true });
    expect(result[1]).toMatchObject({ formattedAmount: null, formattedTotal: null, hasUnpricedPets: true });
  });
});
