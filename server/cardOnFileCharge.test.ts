import { describe, expect, it } from "vitest";
import {
  cardChargeAvailability,
  cardExpired,
  chargeIdempotencyKey,
  describeChargeFailure,
} from "@shared/cardOnFileCharge";

const NOW = new Date("2026-11-02T00:00:00Z");
const SAVED = { stripeCustomerId: "cus_1", stripeDefaultPaymentMethodId: "pm_1" };

describe("cardChargeAvailability", () => {
  it("offers the charge when a card is saved and money is owing", () => {
    const a = cardChargeAvailability({ card: SAVED, owingCents: 21300, stripeConfigured: true, now: NOW });
    expect(a.state).toBe("chargeable");
    expect(a.action).toBe("Charge card on file");
    expect(a.hint).toBeNull();
  });

  it("offers to add a card when there is none", () => {
    const a = cardChargeAvailability({ card: null, owingCents: 21300, stripeConfigured: true, now: NOW });
    expect(a.state).toBe("needs_card");
    expect(a.action).toBe("Add a card");
    expect(a.hint).toMatch(/saved to this client/);
  });

  /** A customer id alone is not a card — that is just a Stripe record. */
  it("still asks for a card when only the customer exists", () => {
    const a = cardChargeAvailability({
      card: { stripeCustomerId: "cus_1", stripeDefaultPaymentMethodId: null },
      owingCents: 100, stripeConfigured: true, now: NOW,
    });
    expect(a.state).toBe("needs_card");
  });

  it("will not charge a booking that owes nothing", () => {
    const a = cardChargeAvailability({ card: SAVED, owingCents: 0, stripeConfigured: true, now: NOW });
    expect(a.state).toBe("nothing_owing");
  });

  it("says so when Stripe is not configured", () => {
    const a = cardChargeAvailability({ card: SAVED, owingCents: 100, stripeConfigured: false, now: NOW });
    expect(a.state).toBe("stripe_off");
  });

  it("asks for a replacement when the saved card has expired", () => {
    const a = cardChargeAvailability({
      card: { ...SAVED, stripeCardExpMonth: 10, stripeCardExpYear: 2026 },
      owingCents: 100, stripeConfigured: true, now: NOW,
    });
    expect(a.state).toBe("expired");
    expect(a.action).toBe("Replace card");
  });
});

describe("cardExpired", () => {
  /** The off-by-one that would send a client to re-enter a working card. */
  it("treats the expiry month itself as still good", () => {
    expect(cardExpired({ stripeCardExpMonth: 11, stripeCardExpYear: 2026 }, NOW)).toBe(false);
    expect(cardExpired({ stripeCardExpMonth: 11, stripeCardExpYear: 2026 }, new Date("2026-11-30T23:59:59Z"))).toBe(false);
    expect(cardExpired({ stripeCardExpMonth: 11, stripeCardExpYear: 2026 }, new Date("2026-12-01T00:00:00Z"))).toBe(true);
  });

  /** Link and wallet methods carry no expiry and charge perfectly well. */
  it("does not call a method with no expiry expired", () => {
    expect(cardExpired({ stripeCardExpMonth: null, stripeCardExpYear: null }, NOW)).toBe(false);
  });
});

describe("chargeIdempotencyKey", () => {
  it("is the same for the same charge, so a double-click cannot double-charge", () => {
    const a = chargeIdempotencyKey({ appointmentIds: [10, 11], amountCents: 21300, alreadyPaidCents: 0 });
    const b = chargeIdempotencyKey({ appointmentIds: [11, 10], amountCents: 21300, alreadyPaidCents: 0 });
    expect(a).toBe(b);
  });

  it("changes once the first charge has landed, so a real second payment is allowed", () => {
    const first = chargeIdempotencyKey({ appointmentIds: [10], amountCents: 5000, alreadyPaidCents: 0 });
    const second = chargeIdempotencyKey({ appointmentIds: [10], amountCents: 5000, alreadyPaidCents: 5000 });
    expect(first).not.toBe(second);
  });

  it("differs by amount and by booking", () => {
    const base = { appointmentIds: [10], alreadyPaidCents: 0 };
    expect(chargeIdempotencyKey({ ...base, amountCents: 100 }))
      .not.toBe(chargeIdempotencyKey({ ...base, amountCents: 200 }));
    expect(chargeIdempotencyKey({ appointmentIds: [10], amountCents: 100, alreadyPaidCents: 0 }))
      .not.toBe(chargeIdempotencyKey({ appointmentIds: [11], amountCents: 100, alreadyPaidCents: 0 }));
  });
});

describe("describeChargeFailure", () => {
  it("tells staff what to do about a 3DS challenge rather than just failing", () => {
    expect(describeChargeFailure("authentication_required", null)).toMatch(/terminal|card link/i);
  });

  it("names the common declines plainly", () => {
    expect(describeChargeFailure("insufficient_funds", null)).toMatch(/insufficient funds/i);
    expect(describeChargeFailure("expired_card", null)).toMatch(/expired/i);
    expect(describeChargeFailure("card_declined", null)).toBe("The card was declined.");
  });

  it("falls back to Stripe's own words, then to something sayable", () => {
    expect(describeChargeFailure(null, "Your card has no money")).toBe("Your card has no money");
    expect(describeChargeFailure(null, null)).toBe("The charge did not go through.");
    expect(describeChargeFailure(null, "   ")).toBe("The charge did not go through.");
  });
});
