import { describe, expect, it } from "vitest";
import { portalAllSetEmail } from "./portalAllSetEmail";

const base = {
  firstName: "Nikki",
  signInUrl: "https://clients.barkinbeautiful.com.au/portal/login",
  loginEmail: "nikki@example.com",
  salonName: "Barkin' Beautiful",
  salonPhone: "07 0000 0000",
};

describe("the 'you're all set' email", () => {
  it("gives a new client the address they sign in at, and their login email", () => {
    const { subject, html } = portalAllSetEmail({ ...base, wasReset: false });
    expect(subject).toBe("You're all set — your Barkin' Beautiful client portal");
    expect(html).toContain('href="https://clients.barkinbeautiful.com.au/portal/login"');
    expect(html).toContain("nikki@example.com");
    expect(html).toContain("only works once");
    expect(html).toContain("Forgot password?");
    expect(html).not.toContain("Didn't change it?");
  });

  it("after a reset, says the password changed and who to call if it wasn't them", () => {
    const { subject, html } = portalAllSetEmail({ ...base, wasReset: true });
    expect(subject).toBe("Your Barkin' Beautiful portal password has been changed");
    expect(html).toContain("has just been changed");
    expect(html).toContain("Call us on 07 0000 0000");
  });

  it("escapes what came from the record", () => {
    const { html } = portalAllSetEmail({ ...base, firstName: "<i>x</i>", loginEmail: 'a"b@c.d', wasReset: false });
    expect(html).toContain("Hi &lt;i&gt;x&lt;/i&gt;,");
    expect(html).toContain("a&quot;b@c.d");
  });

  it("copes with no name and no salon phone", () => {
    const { html } = portalAllSetEmail({ ...base, firstName: null, salonPhone: null, wasReset: true });
    expect(html).toContain("Hi there,");
    expect(html).toContain("Call us straight away");
  });
});
