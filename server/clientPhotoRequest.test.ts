import { describe, it, expect } from "vitest";
import {
  CLIENT_PHOTO_REQUEST_TTL_DAYS,
  MAX_PHOTOS_PER_REQUEST,
  clientPhotoUrl,
  createClientPhotoToken,
  hashClientPhotoToken,
  photoRequestSms,
  photoRequestSmsCost,
  photoRequestState,
} from "@shared/clientPhotoRequest";
import { PRODUCTION_APP_URL } from "@shared/const";

const NOW = new Date("2026-10-15T09:00:00+10:00");
const live = { expiresAt: new Date(NOW.getTime() + 86_400_000), revokedAt: null, uploadCount: 0 };

describe("createClientPhotoToken", () => {
  it("is 128 bits of hex, and only the hash is meant to be stored", () => {
    const a = createClientPhotoToken(NOW);
    expect(a.token).toMatch(/^[0-9a-f]{32}$/);
    expect(a.tokenHash).toBe(hashClientPhotoToken(a.token));
    expect(a.tokenHash).not.toBe(a.token);
  });

  it("does not repeat itself", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createClientPhotoToken().token));
    expect(tokens.size).toBe(200);
  });

  it("expires a week out", () => {
    const { expiresAt } = createClientPhotoToken(NOW);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(CLIENT_PHOTO_REQUEST_TTL_DAYS * 86_400_000);
  });
});

describe("photoRequestState", () => {
  it("lets a live link through and says how many are left", () => {
    expect(photoRequestState(live, NOW)).toEqual({ ok: true, remaining: MAX_PHOTOS_PER_REQUEST });
    expect(photoRequestState({ ...live, uploadCount: 3 }, NOW)).toEqual({ ok: true, remaining: MAX_PHOTOS_PER_REQUEST - 3 });
  });

  it("closes a link once it is older than its week", () => {
    const expired = { ...live, expiresAt: new Date(NOW.getTime() - 1000) };
    expect(photoRequestState(expired, NOW)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("treats the expiry moment itself as past", () => {
    expect(photoRequestState({ ...live, expiresAt: NOW }, NOW)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("says REVOKED rather than expired when staff turned it off", () => {
    // A staff member who withdrew a link needs to see that, not a timeout:
    // the two have different answers for the client on the phone.
    const both = { expiresAt: new Date(NOW.getTime() - 1000), revokedAt: NOW, uploadCount: 0 };
    expect(photoRequestState(both, NOW)).toMatchObject({ ok: false, reason: "revoked" });
  });

  it("stops at the upload ceiling", () => {
    const spent = { ...live, uploadCount: MAX_PHOTOS_PER_REQUEST };
    expect(photoRequestState(spent, NOW)).toMatchObject({ ok: false, reason: "spent" });
  });

  it("refuses a link whose expiry is unreadable rather than allowing it", () => {
    // Fail closed: a bad date must not become an upload link with no end.
    expect(photoRequestState({ ...live, expiresAt: "not a date" }, NOW)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("accepts a date that arrived as a string", () => {
    const asString = { ...live, expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString() };
    expect(photoRequestState(asString, NOW)).toMatchObject({ ok: true });
  });

  it("always tells the client what to do next", () => {
    // These are read on a phone by someone who just tapped a link that did
    // not work. Every one points at the salon rather than stopping at
    // "no". "Expired" stays — it is the clearest word for it — but no
    // message may leak a null or an internal state name like "spent".
    for (const row of [
      { ...live, revokedAt: NOW },
      { ...live, expiresAt: new Date(NOW.getTime() - 1) },
      { ...live, uploadCount: MAX_PHOTOS_PER_REQUEST },
    ]) {
      const state = photoRequestState(row, NOW);
      expect(state.ok).toBe(false);
      if (state.ok) continue;
      expect(state.message).toMatch(/salon/);
      expect(state.message).not.toMatch(/null|undefined|revoked|spent/);
    }
  });
});

describe("the text the client receives", () => {
  const url = clientPhotoUrl(PRODUCTION_APP_URL, "a".repeat(32));

  it("points at the real link", () => {
    expect(url).toBe(`${PRODUCTION_APP_URL}/photo/${"a".repeat(32)}`);
    expect(clientPhotoUrl(`${PRODUCTION_APP_URL}/`, "abc")).toBe(`${PRODUCTION_APP_URL}/photo/abc`);
  });

  it("fits in ONE segment, which is what it costs to send", () => {
    // Every photo request the salon sends pays this. The warning that a
    // texted-back photo never arrives is 76 characters and would double
    // it, so the landing page carries that instead.
    const cost = photoRequestSmsCost("Barkin Beautiful", url);
    expect(cost.segments).toBe(1);
    expect(cost.encoding).toBe("GSM-7");
  });

  it("stays one segment for a longer salon name", () => {
    // Another salon's name is not Barkin Beautiful's length.
    expect(photoRequestSmsCost("Pawfection Grooming Studio & Spa", url).segments).toBe(1);
  });

  it("says what to do and how long it lasts", () => {
    const text = photoRequestSms("Barkin Beautiful", url);
    expect(text).toContain("Barkin Beautiful");
    expect(text).toContain(url);
    expect(text).toContain(`${CLIENT_PHOTO_REQUEST_TTL_DAYS} days`);
  });
});
