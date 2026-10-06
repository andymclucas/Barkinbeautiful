import { describe, expect, it } from "vitest";
import {
  connectState, chargesOnConnectedAccount, describeConnectState,
  platformFeeCents, describeFeeBps, MAX_PLATFORM_FEE_BPS,
} from "@shared/stripeConnect";

describe("where a salon is up to with Stripe", () => {
  it("has not started without an account", () => {
    expect(connectState({})).toBe("not_started");
    expect(connectState({ stripeAccountId: null })).toBe("not_started");
  });

  it("is onboarding until Stripe's questions are answered", () => {
    expect(connectState({ stripeAccountId: "acct_1", stripeDetailsSubmitted: false })).toBe("onboarding");
  });

  it("is restricted when Stripe wants more before money moves", () => {
    expect(connectState({ stripeAccountId: "acct_1", stripeDetailsSubmitted: true, stripeChargesEnabled: false }))
      .toBe("restricted");
  });

  it("is ready once charges are enabled, even if payouts are still held", () => {
    // Stripe routinely enables charges while reviewing payouts. Refusing
    // to let a salon take bookings over a payout they can see pending in
    // their own dashboard would be worse than the delay.
    expect(connectState({
      stripeAccountId: "acct_1", stripeDetailsSubmitted: true,
      stripeChargesEnabled: true, stripePayoutsEnabled: false,
    })).toBe("ready");
  });
});

describe("whose account a payment goes to", () => {
  const ready = { stripeAccountId: "acct_1", stripeDetailsSubmitted: true, stripeChargesEnabled: true };

  it("uses the salon's own account only when Stripe says it can take charges", () => {
    expect(chargesOnConnectedAccount(ready)).toBe(true);
  });

  it("falls back to the platform account at every other stage", () => {
    // This is what protects Barkin' Beautiful, who have no account at all,
    // and a salon half way through onboarding whose clients must still be
    // able to pay.
    expect(chargesOnConnectedAccount({})).toBe(false);
    expect(chargesOnConnectedAccount({ ...ready, stripeDetailsSubmitted: false })).toBe(false);
    expect(chargesOnConnectedAccount({ ...ready, stripeChargesEnabled: false })).toBe(false);
  });
});

describe("Groomigo's cut", () => {
  it("takes nothing when no fee has been decided", () => {
    // NULL is not zero. Nothing is taken until somebody sets a number.
    expect(platformFeeCents(10_000, null)).toBeNull();
    expect(platformFeeCents(10_000, undefined)).toBeNull();
  });

  it("takes nothing when the fee is deliberately zero", () => {
    expect(platformFeeCents(10_000, 0)).toBe(0);
  });

  it("works in basis points", () => {
    // 250 bps is 2.5%, so $100.00 gives $2.50.
    expect(platformFeeCents(10_000, 250)).toBe(250);
    expect(platformFeeCents(14_500, 250)).toBe(362); // $145 groom -> $3.62
  });

  it("rounds DOWN, never in Groomigo's favour", () => {
    // 2.5% of $1.23 is 3.075c. A cent the salon's way every transaction
    // is forgivable; a cent the platform's way is not.
    expect(platformFeeCents(123, 250)).toBe(3);
    expect(platformFeeCents(199, 250)).toBe(4);
  });

  it("never exceeds the payment itself", () => {
    expect(platformFeeCents(1_000, 20_000)).toBe(1_000);
  });

  it("refuses a nonsense fee rather than inventing a charge", () => {
    for (const bad of [-1, NaN, Infinity]) {
      expect(platformFeeCents(10_000, bad), String(bad)).toBeNull();
    }
    expect(platformFeeCents(0, 250)).toBe(0);
    expect(platformFeeCents(-500, 250)).toBe(0);
  });

  it("is capped at something a human would not type by accident", () => {
    expect(MAX_PLATFORM_FEE_BPS).toBe(3000);
  });
});

describe("saying it in words", () => {
  it("distinguishes undecided from free", () => {
    expect(describeFeeBps(null)).toBe("not set");
    expect(describeFeeBps(0)).toBe("no fee");
    expect(describeFeeBps(250)).toBe("2.5%");
    expect(describeFeeBps(1000)).toBe("10%");
    expect(describeFeeBps(175)).toBe("1.75%");
  });

  it("explains each stage without jargon", () => {
    expect(describeConnectState("not_started")).toMatch(/straight to your bank/);
    expect(describeConnectState("onboarding")).toMatch(/pick up where you left off/i);
    expect(describeConnectState("restricted")).toMatch(/reviewing/);
    expect(describeConnectState("ready")).toMatch(/straight to your bank/);
  });
});
