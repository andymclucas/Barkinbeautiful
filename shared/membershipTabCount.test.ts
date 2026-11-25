import { describe, expect, it } from "vitest";
import { membershipTabCount } from "./membershipTabCount";

describe("Memberships heading and pager count", () => {
  it("counts the failed payments on the Failed Payments tab, not every membership (Andy, 25/11/2026)", () => {
    expect(membershipTabCount({ tab: "failed_payments", listTotal: 221, failedPaymentCount: 1 }))
      .toEqual({ heading: "1 failed payment", showPager: false });
    expect(membershipTabCount({ tab: "failed_payments", listTotal: 221, failedPaymentCount: 3 }).heading)
      .toBe("3 failed payments");
  });

  it("uses the paged list on the status tabs", () => {
    expect(membershipTabCount({ tab: "active", listTotal: 151, failedPaymentCount: 1 }))
      .toEqual({ heading: "151 active memberships, billed in Groomigo", showPager: true });
    expect(membershipTabCount({ tab: "to_migrate", listTotal: 139, failedPaymentCount: 0 }))
      .toEqual({ heading: "139 memberships to be migrated, still billed in MoeGo", showPager: true });
    expect(membershipTabCount({ tab: "pending_payment", listTotal: 1, failedPaymentCount: 0 }).heading)
      .toBe("1 pending payment membership");
  });

  it("shows no count or pager on Accounts Receivable, which has its own panel", () => {
    expect(membershipTabCount({ tab: "accounts_receivable", listTotal: 221, failedPaymentCount: 1 }))
      .toEqual({ heading: null, showPager: false });
  });
});
