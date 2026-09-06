import { describe, expect, it } from "vitest";

describe("Resend credential", () => {
  it("authenticates against the domains endpoint without sending email", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey, "RESEND_API_KEY should be configured").toMatch(/^re_/);

    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status, await response.text()).toBe(200);
  }, 15_000);
});
