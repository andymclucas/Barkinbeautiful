import { describe, expect, it } from "vitest";
import { portalFailedPaymentNotice } from "./portalFailedPaymentNotice";

describe("portal notice after a failed membership payment (Andy, 25/11/2026)", () => {
  it("shows nothing when no payment has failed", () => {
    expect(portalFailedPaymentNotice(null)).toBeNull();
  });

  it("says when the next try is, in Brisbane time", () => {
    // 23:00 UTC Wednesday is 9 am Thursday in Brisbane.
    const notice = portalFailedPaymentNotice({ retryAt: "2026-11-25T23:00:00Z", suspended: false });
    expect(notice?.title).toBe("Your last membership payment didn't go through");
    expect(notice?.body).toContain("Thursday 26 November");
  });

  it("says the membership is paused once it is suspended", () => {
    const notice = portalFailedPaymentNotice({ retryAt: null, suspended: true });
    expect(notice?.title).toBe("Your membership is paused");
  });
});
