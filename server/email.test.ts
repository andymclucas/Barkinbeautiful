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
});

describe("failed-payment emails name the right cycle", () => {
  const base = {
    clientName: "Annie Gerard", clientFirstName: "Annie", petName: "Agnes",
    membershipName: "Gold VIP", pricePerCycle: "104.00",
    failedPaymentCount: 1, retryDate: "Monday, 26 October 2026",
    businessName: "Barkin' Beautiful", businessPhone: null, businessEmail: null,
  };

  it("says $450.67/month for a monthly member, not $104.00/week", () => {
    // pricePerCycle is the WEEKLY rate even for a monthly member, so
    // printing it beside "week" tells someone whose card was charged
    // $450.67 that their membership is $104/week. Both true, pairing wrong.
    const html = buildAdminFailedPaymentEmail({ ...base, billingCycle: "monthly" });
    expect(html).toContain("$450.67/month");
    expect(html).not.toContain("$104.00/week");
  });

  it("still says $104.00/week when the member is weekly", () => {
    expect(buildAdminFailedPaymentEmail({ ...base, billingCycle: "weekly" }))
      .toContain("$104.00/week");
  });

  it("defaults to weekly when the cycle is not passed", () => {
    // Every membership was weekly before 23/10/2026, so an older call
    // site that never passes it must keep reading correctly.
    expect(buildAdminFailedPaymentEmail(base)).toContain("$104.00/week");
  });

  it("tells the client the amount in their own cycle too", () => {
    const html = buildClientFailedPaymentEmail({ ...base, billingCycle: "monthly" });
    expect(html).toContain("$450.67/month");
    expect(html).not.toContain("Weekly amount");
  });
});
