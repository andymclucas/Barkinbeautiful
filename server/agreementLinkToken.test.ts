import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agreementLinkUrl, createAgreementLinkToken, readAgreementLinkToken } from "./agreementLinkToken";
import { createCardLinkToken } from "./cardLinkToken";

describe("agreement link token", () => {
  const saved = process.env.JWT_SECRET;
  beforeEach(() => { process.env.JWT_SECRET = "test-secret-for-agreement-links"; });
  afterEach(() => { process.env.JWT_SECRET = saved; });

  it("reads back the client it was made for", () => {
    expect(readAgreementLinkToken(createAgreementLinkToken(1162))).toEqual({ ok: true, clientId: 1162 });
  });

  it("expires after thirty days", () => {
    const made = new Date("2026-11-11T00:00:00Z");
    const token = createAgreementLinkToken(5, made);
    expect(readAgreementLinkToken(token, new Date("2026-12-10T00:00:00Z")).ok).toBe(true);
    expect(readAgreementLinkToken(token, new Date("2026-12-12T00:00:00Z"))).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses an edited client id", () => {
    const [, expiry, sig] = createAgreementLinkToken(5).split(".");
    expect(readAgreementLinkToken(`${(6).toString(36)}.${expiry}.${sig}`)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("will not accept a card link in its place", () => {
    expect(readAgreementLinkToken(createCardLinkToken(5))).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("is short enough for a text", () => {
    const url = agreementLinkUrl("https://staff.barkinbeautiful.com.au/", 10114);
    expect(url).toMatch(/^https:\/\/staff\.barkinbeautiful\.com\.au\/sign\/[0-9a-z]+\.[0-9a-z]+\.[0-9a-f]{12}$/);
    expect(url.length).toBeLessThanOrEqual(65);
  });

  it("refuses to sign without a secret", () => {
    process.env.JWT_SECRET = "";
    expect(() => createAgreementLinkToken(5)).toThrow(/JWT_SECRET/);
  });
});
