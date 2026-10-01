import { describe, it, expect } from "vitest";
import { buildCardLinkEmail, isAcceptableCardLink } from "@shared/cardLinkEmail";

const STRIPE_URL = "https://checkout.stripe.com/c/pay/cs_live_abc123";

describe("isAcceptableCardLink", () => {
  it("accepts Stripe Checkout URLs", () => {
    expect(isAcceptableCardLink(STRIPE_URL)).toBe(true);
    expect(isAcceptableCardLink("https://billing.stripe.com/p/session/abc")).toBe(true);
  });

  it("rejects anything that is not Stripe over https", () => {
    expect(isAcceptableCardLink("http://checkout.stripe.com/c/pay/x")).toBe(false);
    expect(isAcceptableCardLink("https://checkout.stripe.com.evil.test/x")).toBe(false);
    expect(isAcceptableCardLink("https://staff.barkinbeautiful.com.au/x")).toBe(false);
    expect(isAcceptableCardLink("not a url")).toBe(false);
    expect(isAcceptableCardLink("")).toBe(false);
  });
});

describe("buildCardLinkEmail", () => {
  it("refuses to build an email around a non-Stripe link", () => {
    // A client must never be mailed a payment link we cannot vouch for.
    expect(() => buildCardLinkEmail({ url: "https://example.test/pay" })).toThrow(/Stripe Checkout/);
  });

  it("greets the client by name and links to Stripe", () => {
    const { subject, html } = buildCardLinkEmail({ firstName: "Toni", url: STRIPE_URL });
    expect(subject).toBe("Save your card for Barkin' Beautiful");
    expect(html).toContain("Hi Toni,");
    expect(html).toContain(`href="${STRIPE_URL}"`);
  });

  it("falls back to a neutral greeting with no name", () => {
    expect(buildCardLinkEmail({ url: STRIPE_URL }).html).toContain("Hi there,");
    expect(buildCardLinkEmail({ firstName: "   ", url: STRIPE_URL }).html).toContain("Hi there,");
  });

  it("says plainly that following the link charges nothing", () => {
    const { html } = buildCardLinkEmail({ firstName: "Holly", url: STRIPE_URL });
    expect(html).toContain("does not charge you anything");
    expect(html).toContain("never sees or stores your full card number");
  });

  it("changes wording when replacing an existing card", () => {
    const { subject, html } = buildCardLinkEmail({
      firstName: "Toni",
      url: STRIPE_URL,
      replacingExistingCard: true,
    });
    expect(subject).toContain("Update your card details");
    expect(html).toContain("Update my card");
  });

  it("escapes a name that contains HTML", () => {
    const { html } = buildCardLinkEmail({ firstName: '<script>alert("x")</script>', url: STRIPE_URL });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses the salon name it is given", () => {
    const { subject, html } = buildCardLinkEmail({ url: STRIPE_URL, salonName: "Test Salon" });
    expect(subject).toBe("Save your card for Test Salon");
    expect(html).toContain("Test Salon");
  });
});
