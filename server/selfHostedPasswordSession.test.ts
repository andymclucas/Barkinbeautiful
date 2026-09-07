import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("self-hosted password session tokens", () => {
  const sdkSource = readFileSync(new URL("./_core/sdk.ts", import.meta.url), "utf8");
  const authSource = readFileSync(new URL("./routers/auth.ts", import.meta.url), "utf8");

  it("uses a non-empty local app marker when Manus OAuth configuration is absent", () => {
    expect(sdkSource).toContain('const SELF_HOSTED_PASSWORD_APP_ID = "groomigo-self-hosted-password"');
    expect(sdkSource).toContain("appId: ENV.appId || SELF_HOSTED_PASSWORD_APP_ID");
  });

  it("continues to issue signed sessions only after a verified password login", () => {
    expect(authSource).toContain("await bcrypt.compare(input.password, user.passwordHash)");
    expect(authSource).toContain("sdk.createSessionToken(user.openId");
    expect(authSource).toContain("ctx.res.cookie(COOKIE_NAME, sessionToken");
  });
});
