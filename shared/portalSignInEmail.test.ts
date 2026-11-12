import { describe, expect, it } from "vitest";
import { SIGNIN_LINK_SENT_MESSAGE, portalSignInEmail } from "./portalSignInEmail";

describe("the sign-in link email", () => {
  it("carries the link and says it needs no password", () => {
    const { subject, html } = portalSignInEmail({
      firstName: "Fiona", signInUrl: "https://clients.barkinbeautiful.com.au/portal/signin/abc", salonName: "Barkin' Beautiful", code: "048213",
    });
    expect(subject).toBe("Your Barkin' Beautiful sign-in link");
    expect(html).toContain('href="https://clients.barkinbeautiful.com.au/portal/signin/abc"');
    expect(html).toContain("no password needed");
    expect(html).toContain("15 minutes");
    expect(html).toContain("048 213");
  });

  it("escapes the name", () => {
    const { html } = portalSignInEmail({ firstName: "<b>x</b>", signInUrl: "https://x/y", salonName: "S", code: "123456" });
    expect(html).toContain("Hi &lt;b&gt;x&lt;/b&gt;,");
  });

  it("answers the same whether or not the address is a client's", () => {
    expect(SIGNIN_LINK_SENT_MESSAGE).toContain("If that email has a client portal account");
  });
});
