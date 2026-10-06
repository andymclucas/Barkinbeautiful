import { describe, expect, it } from "vitest";
import {
  smsBillingPeriod, smsQuotaFor, describeSmsUsage, maySendSms,
  SMS_QUOTA_BY_PLAN, SMS_WARN_AT_PERCENT,
} from "@shared/smsMetering";

describe("the billing month is a Brisbane month", () => {
  it("puts an early-morning message on the right month", () => {
    // 9am on 1 November in Brisbane is 11pm on 31 October in UTC.
    // Counting in UTC would put it on the previous month's invoice and
    // the salon would be right to argue.
    expect(smsBillingPeriod(new Date("2026-10-31T23:00:00.000Z"))).toBe("2026-11");
    expect(smsBillingPeriod(new Date("2026-11-01T09:00:00.000Z"))).toBe("2026-11");
  });

  it("keeps a late-night message on its own month", () => {
    expect(smsBillingPeriod(new Date("2026-10-31T13:00:00.000Z"))).toBe("2026-10");
  });
});

describe("what a salon is allowed", () => {
  it("gives each plan its allowance", () => {
    expect(smsQuotaFor({ subscriptionPlan: "professional" })).toBe(SMS_QUOTA_BY_PLAN.professional);
    expect(smsQuotaFor({ subscriptionPlan: "enterprise" })).toBe(SMS_QUOTA_BY_PLAN.enterprise);
    expect(smsQuotaFor({ subscriptionPlan: "starter" })).toBe(0);
  });

  it("does not meter a salon that is not billed", () => {
    // Barkin' Beautiful. Counting texts towards a quota they do not pay
    // for is meaningless, and capping them would be worse.
    expect(smsQuotaFor({ subscriptionPlan: "professional", billingExempt: true })).toBeNull();
    expect(smsQuotaFor({ subscriptionPlan: "starter", billingExempt: true })).toBeNull();
  });

  it("does not meter an unrecognised plan, rather than metering it at zero", () => {
    // A typo in a column must never be why a salon cannot tell a client
    // their dog is ready.
    expect(smsQuotaFor({ subscriptionPlan: "something-new" })).toBeNull();
    expect(smsQuotaFor({})).toBeNull();
  });
});

describe("reporting usage", () => {
  it("warns before the cap, not after", () => {
    expect(describeSmsUsage(799, 1000).state).toBe("ok");
    expect(describeSmsUsage(800, 1000).state).toBe("approaching");
    expect(describeSmsUsage(1000, 1000).state).toBe("exceeded");
    expect(SMS_WARN_AT_PERCENT).toBe(80);
  });

  it("reports what is left", () => {
    const u = describeSmsUsage(250, 1000);
    expect(u).toMatchObject({ sent: 250, quota: 1000, remaining: 750, percentUsed: 25, state: "ok" });
  });

  it("never reports negative headroom once over", () => {
    expect(describeSmsUsage(1500, 1000).remaining).toBe(0);
    expect(describeSmsUsage(1500, 1000).percentUsed).toBe(150);
  });

  it("says unlimited for an unmetered salon", () => {
    expect(describeSmsUsage(5000, null)).toMatchObject({ quota: null, remaining: null, state: "unlimited" });
  });
});

describe("whether the message actually goes", () => {
  const over = describeSmsUsage(1200, 1000);
  const fine = describeSmsUsage(100, 1000);

  it("sends over the cap by default, and bills it", () => {
    // The important one. A hard cap means a salon cannot tell a client
    // their dog is ready to collect — the platform breaking a service
    // they have already paid for that month. Overage is a line on an
    // invoice; a dog waiting at the salon is not.
    expect(maySendSms({ usage: over, hasMessagingFeature: true })).toEqual({ send: true });
  });

  it("stops only when a salon has asked to be stopped", () => {
    const decision = maySendSms({ usage: over, hasMessagingFeature: true, hardStop: true });
    expect(decision.send).toBe(false);
    expect((decision as { reason: string }).reason).toMatch(/1000 message allowance/);
  });

  it("refuses a plan without messaging at all", () => {
    expect(maySendSms({ usage: fine, hasMessagingFeature: false }))
      .toEqual({ send: false, reason: "Client messaging is not included in this plan" });
  });

  it("never stops an unmetered salon, even with hardStop set", () => {
    const unlimited = describeSmsUsage(99999, null);
    expect(maySendSms({ usage: unlimited, hasMessagingFeature: true, hardStop: true })).toEqual({ send: true });
  });
});
