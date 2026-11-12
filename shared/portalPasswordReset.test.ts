import { describe, expect, it } from "vitest";
import {
  RESET_REQUESTED_MESSAGE, SELF_RESET_COOLDOWN_MS, SELF_RESET_PER_IP_PER_HOUR,
  ipRequestAllowed, portalPasswordResetEmail, resetEmailAllowed,
} from "./portalPasswordReset";

describe("throttling the forgot-password form", () => {
  it("sends one email per address per five minutes", () => {
    const now = 1_000_000_000;
    expect(resetEmailAllowed(undefined, now)).toBe(true);
    expect(resetEmailAllowed(now - 60_000, now)).toBe(false);
    expect(resetEmailAllowed(now - SELF_RESET_COOLDOWN_MS, now)).toBe(true);
  });

  it("caps one IP at ten requests an hour, forgetting older ones", () => {
    const now = 10_000_000;
    const recent = Array.from({ length: SELF_RESET_PER_IP_PER_HOUR }, (_, i) => now - i * 1000);
    expect(ipRequestAllowed(recent, now).allowed).toBe(false);
    const old = recent.map((t) => t - 61 * 60 * 1000);
    expect(ipRequestAllowed(old, now)).toEqual({ allowed: true, keep: [] });
  });

  it("says the same thing whether or not the address is a client", () => {
    expect(RESET_REQUESTED_MESSAGE).toContain("If that email has a client portal account");
  });
});

describe("the reset email", () => {
  const now = new Date("2026-11-12T01:00:00Z");

  it("gives a self-service link's life in hours and says the old password still works", () => {
    const { subject, html } = portalPasswordResetEmail({
      firstName: "Nikki", resetUrl: "https://staff.barkinbeautiful.com.au/portal/setup/abc",
      expiresAt: new Date(now.getTime() + 2 * 3_600_000), now,
    });
    expect(subject).toBe("Reset your Barkin' Beautiful client portal password");
    expect(html).toContain("Hi Nikki,");
    expect(html).toContain('href="https://staff.barkinbeautiful.com.au/portal/setup/abc"');
    expect(html).toContain("works for the next 2 hours");
    expect(html).toContain("your current password still works");
  });

  it("gives the salon's 30-day link a Brisbane date", () => {
    const { html } = portalPasswordResetEmail({
      firstName: null, resetUrl: "https://x/portal/setup/t", expiresAt: new Date("2026-12-12T01:00:00Z"), now,
    });
    expect(html).toContain("Hi there,");
    expect(html).toContain("expires on 12 December 2026");
  });

  it("escapes a name rather than putting markup in the email", () => {
    const { html } = portalPasswordResetEmail({ firstName: "<b>Jo</b>", resetUrl: "https://x/t", expiresAt: now, now });
    expect(html).toContain("Hi &lt;b&gt;Jo&lt;/b&gt;,");
  });
});
