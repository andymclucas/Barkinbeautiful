import { describe, expect, it } from "vitest";
import { isSetupRow, paymentStatusLabel } from "./familyBilling";

describe("paymentStatusLabel", () => {
  it("does not call the $0.00 set-up invoice a payment", () => {
    expect(paymentStatusLabel("paid", 0)).toBe("Set up · nothing charged");
    expect(isSetupRow("paid", 0)).toBe(true);
  });

  it("still says Paid for money that came in, and Failed for money that did not", () => {
    expect(paymentStatusLabel("paid", 5100)).toBe("✓ Paid");
    expect(paymentStatusLabel("failed", 5100)).toBe("✗ Failed");
    expect(isSetupRow("paid", 5100)).toBe(false);
    expect(isSetupRow("failed", 0)).toBe(false);
  });

  it("passes any other status through as it is", () => {
    expect(paymentStatusLabel("refunded", 1700)).toBe("refunded");
    expect(paymentStatusLabel(null, 0)).toBe("");
  });
});
