import { describe, expect, it } from "vitest";

/**
 * INTEGRATION TESTS — excluded from the default `pnpm test` run.
 *
 * These require real production secrets and make real outbound network calls.
 * They are deliberately kept out of the unit suite so that `pnpm test` is
 * hermetic and can pass on any machine and in CI without credentials.
 *
 * Run deliberately, with RESEND_API_KEY present:
 *
 *   corepack pnpm run test:integration
 *
 * See vitest.config.ts (`exclude`) and CLAUDE.md §7.
 */
describe("Resend credential (integration — requires RESEND_API_KEY)", () => {
  it("has a Resend API key configured in the environment", () => {
    const key = process.env.RESEND_API_KEY;
    expect(key, "RESEND_API_KEY should be configured").toBeTruthy();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(10);
    expect(key).toMatch(/^re_/);
  });

  it("authenticates against the domains endpoint without sending email", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey, "RESEND_API_KEY should be configured").toMatch(/^re_/);

    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status, await response.text()).toBe(200);
  }, 15_000);
});
