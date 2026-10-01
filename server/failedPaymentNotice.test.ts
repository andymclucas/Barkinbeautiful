import { describe, it, expect } from "vitest";
import {
  failedPaymentHeadline,
  failedPaymentDetail,
  sortFailedPayments,
  type FailedPaymentRow,
} from "@shared/failedPaymentNotice";

const row = (over: Partial<FailedPaymentRow> = {}): FailedPaymentRow => ({
  membershipId: 1, clientFirstName: "Toni", clientLastName: "Constantini",
  petName: "Lily", failedCount: 1, suspended: false, ...over,
});

describe("failedPaymentHeadline", () => {
  it("names the client and the pet", () => {
    expect(failedPaymentHeadline(row())).toBe("Toni Constantini · Lily");
  });

  it("degrades gracefully as fields go missing", () => {
    expect(failedPaymentHeadline(row({ petName: null }))).toBe("Toni Constantini");
    expect(failedPaymentHeadline(row({ clientFirstName: null, clientLastName: null }))).toBe("Lily");
    expect(
      failedPaymentHeadline({ membershipId: 7, clientFirstName: " ", petName: "", membershipName: "Gold VIP" }),
    ).toBe("Gold VIP");
    expect(failedPaymentHeadline({ membershipId: 7 })).toBe("Membership 7");
  });
});

describe("failedPaymentDetail", () => {
  it("distinguishes one failure from several", () => {
    expect(failedPaymentDetail(row({ failedCount: 1 }))).toBe("Payment failed");
    expect(failedPaymentDetail(row({ failedCount: 3 }))).toBe("Payment failed 3 times");
  });

  it("calls out a suspension, which is the urgent case", () => {
    expect(failedPaymentDetail(row({ failedCount: 3, suspended: true })))
      .toBe("Payment failed 3 times · bookings suspended");
  });

  it("copes with missing or odd counts", () => {
    expect(failedPaymentDetail(row({ failedCount: null }))).toBe("Payment failed");
    expect(failedPaymentDetail(row({ failedCount: -2 }))).toBe("Payment failed");
  });
});

describe("sortFailedPayments", () => {
  it("puts suspended clients first, then most failures, then most recent", () => {
    const a = row({ membershipId: 1, failedCount: 1, suspended: false, lastFailedAt: "2026-09-30" });
    const b = row({ membershipId: 2, failedCount: 5, suspended: false, lastFailedAt: "2026-09-01" });
    const c = row({ membershipId: 3, failedCount: 1, suspended: true,  lastFailedAt: "2026-08-01" });
    const d = row({ membershipId: 4, failedCount: 1, suspended: false, lastFailedAt: "2026-10-01" });
    expect(sortFailedPayments([a, b, c, d]).map(r => r.membershipId)).toEqual([3, 2, 4, 1]);
  });

  it("does not mutate the input and survives bad dates", () => {
    const input = [row({ membershipId: 1, lastFailedAt: "nonsense" }), row({ membershipId: 2, lastFailedAt: null })];
    const copy = [...input];
    sortFailedPayments(input);
    expect(input).toEqual(copy);
  });
});
