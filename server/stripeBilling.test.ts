import { describe, it, expect } from "vitest";
import {
  toStripeCents,
  fromStripeCents,
  classifyFailure,
  planAfterFailure,
  stripeRecurring,
  billingCycleFromWeeks,
  canChargeOffSession,
  describeCard,
  isCardExpired,
  describeStripeKey,
} from "../shared/stripeBilling";
import { brisbaneDate } from "../shared/businessDays";

describe("money at the Stripe boundary", () => {
  it("converts dollars to integer cents", () => {
    expect(toStripeCents("45.50")).toBe(4550);
    expect(toStripeCents(45.5)).toBe(4550);
    expect(toStripeCents("$1,290.00")).toBe(129000);
  });

  it("rounds rather than truncating, so a cent is never quietly dropped", () => {
    // 19.99 * 100 is 1998.9999999999998 in floating point. Truncating charges
    // the client a cent less than the invoice says, every week.
    expect(toStripeCents("19.99")).toBe(1999);
    expect(toStripeCents("0.07")).toBe(7);
  });

  it("treats a missing or unparseable amount as zero, not NaN", () => {
    expect(toStripeCents(null)).toBe(0);
    expect(toStripeCents("")).toBe(0);
    expect(toStripeCents("free")).toBe(0);
  });

  it("round-trips back to dollars", () => {
    expect(fromStripeCents(4550)).toBe(45.5);
    expect(fromStripeCents(null)).toBe(0);
  });
});

describe("classifyFailure", () => {
  it("retries a plain decline - most often just funds on the day", () => {
    expect(classifyFailure("card_declined")).toBe("retry");
    expect(classifyFailure("insufficient_funds")).toBe("retry");
    expect(classifyFailure("processing_error")).toBe("retry");
  });

  it("asks for a new card when the card itself cannot work", () => {
    // Retrying an expired card just burns both attempts and suspends a client
    // who would happily have given a new number.
    expect(classifyFailure("expired_card")).toBe("new_card");
    expect(classifyFailure("incorrect_cvc")).toBe("new_card");
    expect(classifyFailure("authentication_required")).toBe("new_card");
  });

  it("sends the client to their bank when the bank is refusing", () => {
    expect(classifyFailure("call_issuer")).toBe("contact_bank");
    expect(classifyFailure("stolen_card")).toBe("contact_bank");
    expect(classifyFailure("do_not_honor")).toBe("contact_bank");
  });

  it("is case and whitespace tolerant, and defaults to retrying", () => {
    expect(classifyFailure(" Expired_Card ")).toBe("new_card");
    expect(classifyFailure(null)).toBe("retry");
    expect(classifyFailure("something_new_stripe_invented")).toBe("retry");
  });
});

describe("planAfterFailure", () => {
  // A Thursday, 10am Brisbane.
  const thursday = new Date("2026-10-01T00:00:00Z");
  // A Friday, so the next business day crosses a weekend.
  const friday = new Date("2026-10-02T00:00:00Z");

  it("schedules a first retry for the next business day", () => {
    const plan = planAfterFailure(1, "retry", thursday);
    expect(plan.retry).toBe(true);
    expect(plan.suspend).toBe(false);
    expect(brisbaneDate(plan.retryAt!)).toBe("2026-10-02");
  });

  it("skips the weekend", () => {
    const plan = planAfterFailure(1, "retry", friday);
    expect(brisbaneDate(plan.retryAt!)).toBe("2026-10-05"); // Monday
  });

  it("suspends on the second failure rather than retrying forever", () => {
    const plan = planAfterFailure(2, "retry", thursday);
    expect(plan.retry).toBe(false);
    expect(plan.retryAt).toBeNull();
    expect(plan.suspend).toBe(true);
    expect(plan.reason).toMatch(/2 failed payments/);
  });

  it("does not waste an attempt when the card can never work", () => {
    const plan = planAfterFailure(1, "new_card", thursday);
    expect(plan.retry).toBe(false);
    expect(plan.suspend).toBe(true);
    expect(plan.reason).toMatch(/new card details/i);
  });

  it("stops immediately when the bank is refusing", () => {
    const plan = planAfterFailure(1, "contact_bank", thursday);
    expect(plan.retry).toBe(false);
    expect(plan.reason).toMatch(/bank/i);
  });
});

describe("stripeRecurring", () => {
  it("bills memberships weekly", () => {
    expect(stripeRecurring("weekly")).toEqual({ interval: "week", interval_count: 1 });
  });

  it("expresses a fortnight as two weeks, which is what Stripe accepts", () => {
    expect(stripeRecurring("fortnightly")).toEqual({ interval: "week", interval_count: 2 });
  });

  it("handles monthly", () => {
    expect(stripeRecurring("monthly")).toEqual({ interval: "month", interval_count: 1 });
  });
});

describe("canChargeOffSession", () => {
  it("needs both the customer and the payment method", () => {
    expect(canChargeOffSession({ stripeCustomerId: "cus_1", stripeDefaultPaymentMethodId: "pm_1" })).toBe(true);
    expect(canChargeOffSession({ stripeCustomerId: "cus_1", stripeDefaultPaymentMethodId: null })).toBe(false);
    expect(canChargeOffSession({ stripeCustomerId: null, stripeDefaultPaymentMethodId: "pm_1" })).toBe(false);
    expect(canChargeOffSession({})).toBe(false);
  });
});

describe("describeCard", () => {
  it("reads the way a receptionist would say it out loud", () => {
    expect(describeCard({ stripeCardBrand: "visa", stripeCardLast4: "4242", stripeCardExpMonth: 8, stripeCardExpYear: 2028 }))
      .toBe("Visa ···· 4242 · exp 08/28");
  });

  it("copes with a card whose expiry was never stored", () => {
    expect(describeCard({ stripeCardBrand: "mastercard", stripeCardLast4: "1881" })).toBe("Mastercard ···· 1881");
  });

  it("is null when there is no card on file", () => {
    expect(describeCard({})).toBeNull();
  });
});

describe("isCardExpired", () => {
  it("is still valid on the last day of the expiry month", () => {
    // Cards expire at the END of the printed month.
    expect(isCardExpired({ stripeCardExpMonth: 9, stripeCardExpYear: 2026 }, new Date("2026-09-30T23:00:00Z"))).toBe(false);
  });

  it("is expired once the month has passed", () => {
    expect(isCardExpired({ stripeCardExpMonth: 9, stripeCardExpYear: 2026 }, new Date("2026-10-01T00:00:00Z"))).toBe(true);
  });

  it("says nothing when no expiry is stored", () => {
    expect(isCardExpired({}, new Date())).toBe(false);
  });
});

describe("describeStripeKey", () => {
  it("tells test and live apart", () => {
    expect(describeStripeKey("sk_test_" + "a".repeat(40))).toMatchObject({ configured: true, mode: "test" });
    expect(describeStripeKey("sk_live_" + "a".repeat(40))).toMatchObject({ configured: true, mode: "live" });
  });

  it("does not count a placeholder as configured", () => {
    // This is exactly what sat in .env while the integration looked wired up.
    expect(describeStripeKey("sk_test_placeholder")).toMatchObject({ configured: false, placeholder: true });
    expect(describeStripeKey("")).toMatchObject({ configured: false, mode: "unknown" });
    expect(describeStripeKey(undefined)).toMatchObject({ configured: false });
  });
});

describe("billingCycleFromWeeks", () => {
  it("maps the cycles the salon actually sells", () => {
    expect(billingCycleFromWeeks(1)).toBe("weekly");
    expect(billingCycleFromWeeks(2)).toBe("fortnightly");
  });

  it("refuses to guess rather than billing at the wrong cadence", () => {
    // 4 weeks is 13 charges a year, a month is 12. Guessing either way is a
    // real overcharge or undercharge, so the caller must ask a human.
    expect(billingCycleFromWeeks(4)).toBeNull();
    expect(billingCycleFromWeeks(3)).toBeNull();
    expect(billingCycleFromWeeks(0)).toBeNull();
    expect(billingCycleFromWeeks(null)).toBeNull();
    expect(billingCycleFromWeeks(undefined)).toBeNull();
  });
});
