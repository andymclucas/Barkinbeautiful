import { describe, expect, it } from "vitest";
import {
  activeMembership,
  describeCard,
  describePortal,
  hasCardOnFile,
  isActiveMembership,
  portalIsSetUp,
} from "@shared/clientListFacts";

describe("has this client set up their portal", () => {
  it("is yes only once they can actually sign in", () => {
    expect(portalIsSetUp("active")).toBe(true);
  });

  it("counts an unfinished invitation as not set up", () => {
    /*
     * They have been sent a link and have not finished. The honest
     * answer to "is their portal set up?" is no, and this is the group
     * worth chasing — which is why the column was asked for.
     */
    expect(portalIsSetUp("setup_pending")).toBe(false);
    expect(describePortal("setup_pending")).toBe("Invited");
  });

  it("counts a revoked account as not set up", () => {
    // It existed and was taken away. Listing them as able to log in
    // would be listing somebody who cannot.
    expect(portalIsSetUp("revoked")).toBe(false);
    expect(describePortal("revoked")).toBe("No");
  });

  it("says no for a client with nothing recorded", () => {
    for (const value of ["not_enabled", "", null, undefined]) {
      expect(portalIsSetUp(value), String(value)).toBe(false);
      expect(describePortal(value), String(value)).toBe("No");
    }
  });
});

describe("is there a card on file", () => {
  it("reads the payment method, not the brand", () => {
    /*
     * A Stripe Link method carries no brand and no last4 — Andy's own
     * test card is one. Reading those would report "no card" for a
     * client who has one and can be charged.
     */
    const link = {
      stripeDefaultPaymentMethodId: "pm_1ULaidAwaBS2YIYS6raOHoWn",
    };
    expect(hasCardOnFile(link)).toBe(true);
    expect(describeCard(link)).toBe("Yes");
  });

  it("names the card when Stripe gave a brand", () => {
    expect(
      describeCard({
        stripeDefaultPaymentMethodId: "pm_123",
        stripeCardBrand: "Visa",
        stripeCardLast4: "4242",
      })
    ).toBe("Visa ••4242");
  });

  it("is no when there is nothing to charge", () => {
    expect(hasCardOnFile({})).toBe(false);
    expect(hasCardOnFile({ stripeDefaultPaymentMethodId: "   " })).toBe(false);
    expect(describeCard({})).toBe("No");
  });

  it("is no for a client who has a Stripe customer but never a card", () => {
    // Every client billed through Stripe has a customer record. Having
    // one says nothing about whether a card was ever entered.
    expect(hasCardOnFile({ stripeDefaultPaymentMethodId: null })).toBe(false);
  });
});

describe("which membership to show", () => {
  it("shows an active one by name", () => {
    expect(
      activeMembership([{ name: "Gold VIP Styled", status: "active" }])
    ).toEqual({ label: "Gold VIP Styled", extra: 0 });
  });

  it("shows nothing for a membership that has stopped", () => {
    // Andy, 10/11/2026: "Only active memberships." A client who stopped
    // paying in March is not a member now, and a list that says they are
    // gets them booked as covered.
    for (const status of [
      "paused",
      "cancelled",
      "expired",
      "pending_payment",
    ]) {
      expect(
        activeMembership([{ name: "Gold VIP Styled", status }]),
        status
      ).toBeNull();
      expect(isActiveMembership(status), status).toBe(false);
    }
  });

  it("shows nothing at all for a client with no membership", () => {
    expect(activeMembership([])).toBeNull();
  });

  it("falls back to the tier when the row has no name", () => {
    expect(activeMembership([{ tier: "gold", status: "active" }])).toEqual({
      label: "Gold",
      extra: 0,
    });
  });

  it("says how many others there are rather than silently picking", () => {
    /*
     * A client can hold more than one row — the MoeGo import filed two
     * plans under one dog for nine of ten multi-plan clients. Showing
     * one and hiding the rest is how that stayed invisible.
     */
    expect(
      activeMembership([
        { name: "Gold VIP Styled", status: "active" },
        { name: "Bronze Regular", status: "active" },
      ])
    ).toEqual({ label: "Gold VIP Styled", extra: 1 });
  });

  it("ignores the stopped ones when counting the extras", () => {
    expect(
      activeMembership([
        { name: "Gold VIP Styled", status: "active" },
        { name: "Bronze Regular", status: "cancelled" },
      ])
    ).toEqual({ label: "Gold VIP Styled", extra: 0 });
  });
});
