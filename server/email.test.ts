import { describe, it, expect } from "vitest";
import { buildAdminFailedPaymentEmail, buildClientFailedPaymentEmail } from "./email";

describe("email templates", () => {
  it("buildAdminFailedPaymentEmail returns HTML with client name", () => {
    const html = buildAdminFailedPaymentEmail({
      clientName: "Jane Smith",
      petName: "Buddy",
      membershipName: "Gold VIP Styled - SML",
      pricePerCycle: "35.00",
      failedPaymentCount: 1,
      retryDate: "07 Aug 2026",
    });
    expect(html).toContain("Jane Smith");
    expect(html).toContain("Buddy");
    expect(html).toContain("Gold VIP Styled - SML");
    expect(html).toContain("$35.00/week");
    expect(html).toContain("07 Aug 2026");
  });

  it("buildClientFailedPaymentEmail returns HTML with client first name", () => {
    const html = buildClientFailedPaymentEmail({
      clientFirstName: "Jane",
      petName: "Buddy",
      membershipName: "Gold VIP Styled - SML",
      pricePerCycle: "35.00",
      businessName: "Barkin' Beautiful",
      businessPhone: "04 0000 0000",
      businessEmail: "hello@barkinbeautiful.com.au",
    });
    expect(html).toContain("Jane");
    expect(html).toContain("Buddy");
    expect(html).toContain("Barkin' Beautiful");
    expect(html).toContain("04 0000 0000");
  });

  it("RESEND_API_KEY environment variable is set", () => {
    // This test validates the secret is present in the environment
    const key = process.env.RESEND_API_KEY;
    expect(key).toBeTruthy();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(10);
  });
});
