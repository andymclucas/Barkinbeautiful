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
import { brisbaneDate, isBrisbaneWeekend } from "../shared/businessDays";

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

describe("describeCard with no card details", () => {
  it("still reports a saved payment method rather than claiming none", () => {
    // A wallet/Link method charges fine but carries no brand or last4.
    // Saying "no card" here made staff re-ask a client who had just paid.
    expect(describeCard({ stripeDefaultPaymentMethodId: "pm_123" }))
      .toBe("Payment method saved · card details unavailable");
  });

  it("names the method type when that is all we captured", () => {
    expect(describeCard({ stripeCardBrand: "link", stripeDefaultPaymentMethodId: "pm_1" }))
      .toBe("Link saved · card details unavailable");
    expect(describeCard({ stripeCardBrand: "au_becs_debit", stripeDefaultPaymentMethodId: "pm_1" }))
      .toBe("Au Becs Debit saved · card details unavailable");
  });

  it("still returns null when genuinely nothing is saved", () => {
    expect(describeCard({})).toBeNull();
    expect(describeCard({ stripeDefaultPaymentMethodId: null })).toBeNull();
  });

  it("is unchanged when full card details exist", () => {
    expect(describeCard({
      stripeCardBrand: "visa", stripeCardLast4: "4242",
      stripeCardExpMonth: 8, stripeCardExpYear: 2028,
      stripeDefaultPaymentMethodId: "pm_1",
    })).toBe("Visa ···· 4242 · exp 08/28");
  });
});

describe("retry thresholds by billing cycle", () => {
  // A Monday, so the business-day maths is easy to follow.
  const monday = new Date("2026-10-26T04:00:00Z"); // 14:00 Brisbane

  it("leaves weekly exactly as it was: two attempts, next business day", () => {
    const first = planAfterFailure(1, "retry", monday, "weekly");
    expect(first.retry).toBe(true);
    expect(first.suspend).toBe(false);
    expect(brisbaneDate(first.retryAt!)).toBe("2026-10-27"); // Tuesday

    const second = planAfterFailure(2, "retry", monday, "weekly");
    expect(second.retry).toBe(false);
    expect(second.suspend).toBe(true);
  });

  it("gives monthly four attempts, not two", () => {
    // The next natural charge is a MONTH away, so these retries are the
    // only recovery path. Two attempts inside 24 hours then four weeks of
    // silence is the wrong shape for a $116 charge.
    for (const count of [1, 2, 3]) {
      const plan = planAfterFailure(count, "retry", monday, "monthly");
      expect(plan.retry).toBe(true);
      expect(plan.suspend).toBe(false);
    }
    const final = planAfterFailure(4, "retry", monday, "monthly");
    expect(final.retry).toBe(false);
    expect(final.suspend).toBe(true);
  });

  it("spaces monthly retries three business days apart, skipping the weekend", () => {
    // Monday + 3 business days = Thursday. Not Wednesday, and never a
    // Saturday.
    const plan = planAfterFailure(1, "retry", monday, "monthly");
    expect(brisbaneDate(plan.retryAt!)).toBe("2026-10-29"); // Thursday
    expect(isBrisbaneWeekend(plan.retryAt!)).toBe(false);
  });

  it("covers a fortnightly pay cycle before suspending", () => {
    // Most Australians are paid fortnightly, and a $116 charge fails on
    // timing far more often than a $27 one. Walk the whole ladder.
    let at = monday;
    const days: string[] = [];
    for (let attempt = 1; attempt < 4; attempt += 1) {
      const plan = planAfterFailure(attempt, "retry", at, "monthly");
      at = plan.retryAt!;
      days.push(brisbaneDate(at));
    }
    expect(days).toEqual(["2026-10-29", "2026-11-03", "2026-11-06"]);
    // From the first failure to the last attempt: 11 calendar days.
    const span = (at.getTime() - monday.getTime()) / 86_400_000;
    expect(span).toBeGreaterThan(10);
  });

  it("defaults to weekly when no cycle is given", () => {
    // Every membership billed weekly before 23/10/2026, and any caller
    // that has not been updated must keep behaving exactly as it did.
    expect(planAfterFailure(2, "retry", monday)).toEqual(planAfterFailure(2, "retry", monday, "weekly"));
  });

  it("still suspends a bad card immediately, whatever the cycle", () => {
    // No number of retries fixes an expired card or a bank refusal, so
    // the extra monthly attempts must not be spent on one.
    for (const cycle of ["weekly", "monthly"] as const) {
      for (const action of ["new_card", "contact_bank"] as const) {
        const plan = planAfterFailure(1, action, monday, cycle);
        expect(plan.retry).toBe(false);
        expect(plan.suspend).toBe(true);
      }
    }
  });
});
