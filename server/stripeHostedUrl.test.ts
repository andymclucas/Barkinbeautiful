import { describe, it, expect } from "vitest";
import { isStripeHostedUrl } from "@shared/stripeHostedUrl";

/**
 * A payment button is the most impersonatable thing in an email, so the
 * destination is verified rather than trusted — whatever ends up in the
 * database column it came from.
 */
describe("isStripeHostedUrl", () => {
  it("accepts the hosts Stripe actually serves", () => {
    expect(isStripeHostedUrl("https://checkout.stripe.com/c/pay/cs_live_abc123")).toBe(true);
    expect(isStripeHostedUrl("https://invoice.stripe.com/i/acct_1/live_xyz")).toBe(true);
    expect(isStripeHostedUrl("https://billing.stripe.com/p/session/abc")).toBe(true);
    expect(isStripeHostedUrl("https://stripe.com/anything")).toBe(true);
  });

  it("refuses anything that is not https", () => {
    expect(isStripeHostedUrl("http://checkout.stripe.com/c/pay/x")).toBe(false);
    expect(isStripeHostedUrl("javascript:alert(1)")).toBe(false);
    expect(isStripeHostedUrl("data:text/html,<script>")).toBe(false);
  });

  /** The leading dot is load-bearing. */
  it("refuses a lookalike host", () => {
    expect(isStripeHostedUrl("https://stripe.com.attacker.net/pay")).toBe(false);
    expect(isStripeHostedUrl("https://notstripe.com/pay")).toBe(false);
    expect(isStripeHostedUrl("https://checkout.stripe.com.evil.io/c/pay")).toBe(false);
    expect(isStripeHostedUrl("https://fakestripe.com/c/pay")).toBe(false);
  });

  it("refuses junk rather than throwing", () => {
    expect(isStripeHostedUrl("")).toBe(false);
    expect(isStripeHostedUrl("not a url")).toBe(false);
    expect(isStripeHostedUrl("//checkout.stripe.com/x")).toBe(false);
  });
});
