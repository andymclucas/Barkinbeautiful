import { describe, expect, it } from "vitest";
import { calculateMembershipAccount } from "../shared/membershipAccountsReceivable";

describe("membership accounts receivable", () => {
  it("calculates the shortfall as delivered groom value less all recorded membership payments", () => {
    const account = calculateMembershipAccount({
      membershipStatus: "cancelled",
      failedPaymentCount: 3,
      bookingSuspended: true,
      paymentAmount: 156,
      ledgerPaymentAmount: 0,
      appointmentGroomValue: 585,
      ledgerGroomValue: 0,
      unvaluedCompletedGrooms: 0,
    });

    expect(account.paidToDate).toBe(156);
    expect(account.groomValueDelivered).toBe(585);
    expect(account.arrearsAmount).toBe(429);
    expect(account.accountStatus).toBe("cancelled");
    expect(account.requiresBookingReview).toBe(true);
    expect(account.invoiceReady).toBe(true);
  });

  it("marks a first declined charge as grace period while retaining any account shortfall", () => {
    const account = calculateMembershipAccount({
      membershipStatus: "pending_payment",
      failedPaymentCount: 1,
      bookingSuspended: false,
      paymentAmount: 50,
      ledgerPaymentAmount: 0,
      appointmentGroomValue: 120,
      ledgerGroomValue: 0,
      unvaluedCompletedGrooms: 0,
    });

    expect(account.accountStatus).toBe("grace_period");
    expect(account.arrearsAmount).toBe(70);
    expect(account.requiresBookingReview).toBe(true);
  });

  it("does not permit a final arrears invoice until all completed grooms have a confirmed value", () => {
    const account = calculateMembershipAccount({
      membershipStatus: "active",
      failedPaymentCount: 0,
      bookingSuspended: false,
      paymentAmount: 0,
      ledgerPaymentAmount: 0,
      appointmentGroomValue: 0,
      ledgerGroomValue: 0,
      unvaluedCompletedGrooms: 2,
    });

    expect(account.invoiceReady).toBe(false);
    expect(account.unvaluedCompletedGrooms).toBe(2);
  });
});
