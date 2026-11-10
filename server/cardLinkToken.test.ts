import { beforeAll, describe, expect, it } from "vitest";
import {
  CARD_LINK_TTL_DAYS,
  cardLinkUrl,
  createCardLinkToken,
  readCardLinkToken,
} from "./cardLinkToken";
import { calculateSmsCost } from "@shared/smsSegments";

beforeAll(() => {
  // The real one is in the environment; the suite is hermetic.
  process.env.JWT_SECRET = "test-secret-for-card-links";
});

const now = new Date("2026-11-10T00:00:00Z");

describe("the short card link", () => {
  it("reads back the client it was made for", () => {
    const token = createCardLinkToken(1162, now);
    expect(readCardLinkToken(token, now)).toEqual({ ok: true, clientId: 1162 });
  });

  it("is short enough to be worth doing", () => {
    /*
     * The point of the whole exercise. The Stripe URL it replaces was
     * 299 characters before it ran off the edge of Lauren's screen, and
     * a real one runs to about 500.
     */
    const url = cardLinkUrl("https://staff.barkinbeautiful.com.au", 1162, now);
    expect(url.length).toBeLessThan(80);
  });

  it("keeps the message Lauren actually sends inside two segments", () => {
    // Her words, with the link on the end. Four segments before this.
    const message =
      "Hey Geri, just trying to set up card details in my new system for Stevie. " +
      "Can you please put your card details in the secure link. Let me know if you " +
      "have any problems. Lauren\n" +
      cardLinkUrl("https://staff.barkinbeautiful.com.au", 1162, now);
    expect(calculateSmsCost(message).segments).toBeLessThanOrEqual(2);
  });

  it("refuses a token somebody has edited", () => {
    const token = createCardLinkToken(1162, now);
    // The client id swapped for another, which is the attack that matters:
    // it would put one client's card on another's account.
    const forged = `${(1163).toString(36)}.${token.split(".")[1]}.${token.split(".")[2]}`;
    expect(readCardLinkToken(forged, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("refuses a token with the expiry pushed out", () => {
    const token = createCardLinkToken(1162, now);
    const [client, , signature] = token.split(".");
    const later = (Math.floor(now.getTime() / 60000) + 365 * 24 * 60).toString(
      36
    );
    expect(readCardLinkToken(`${client}.${later}.${signature}`, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("refuses nonsense without throwing", () => {
    // Anything can be typed into a URL bar.
    for (const junk of ["", "   ", "abc", "a.b", "a.b.c.d", "....", "-1.x.y"]) {
      expect(readCardLinkToken(junk, now).ok, junk).toBe(false);
    }
  });

  it("lasts the month it says it does, and not a minute more", () => {
    const token = createCardLinkToken(1162, now);
    const justInside = new Date(
      now.getTime() + CARD_LINK_TTL_DAYS * 24 * 60 * 60 * 1000 - 60_000
    );
    const justOutside = new Date(
      now.getTime() + CARD_LINK_TTL_DAYS * 24 * 60 * 60 * 1000 + 60_000
    );
    expect(readCardLinkToken(token, justInside).ok).toBe(true);
    expect(readCardLinkToken(token, justOutside)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("gives two clients different tokens", () => {
    expect(createCardLinkToken(1162, now)).not.toBe(
      createCardLinkToken(1163, now)
    );
  });

  it("will not sign without a secret", () => {
    // A predictable signature on a link that opens card entry is worse
    // than the feature being unavailable.
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "";
    expect(() => createCardLinkToken(1162, now)).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = saved;
  });
});
