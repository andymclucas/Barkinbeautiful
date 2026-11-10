import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPortalManifest,
  portalAccessTokenIn,
  portalManifestHrefFor,
  portalStartUrlFor,
  STATIC_PORTAL_MANIFEST_PATH,
} from "./portalManifest";

const TOKEN = "a".repeat(64);
const REAL_SHAPE = "648c6f4a01" + "b".repeat(54); // 64 hex, like a live one

describe("the token in a portal path", () => {
  it("finds one on the page a client's email link opens", () => {
    expect(portalAccessTokenIn(`/portal/${TOKEN}`)).toBe(TOKEN);
    expect(portalAccessTokenIn(`/portal/${REAL_SHAPE}`)).toBe(REAL_SHAPE);
  });

  it("survives a trailing slash, a query and a hash", () => {
    expect(portalAccessTokenIn(`/portal/${TOKEN}/`)).toBe(TOKEN);
    expect(portalAccessTokenIn(`/portal/${TOKEN}?from=email`)).toBe(TOKEN);
    expect(portalAccessTokenIn(`/portal/${TOKEN}#bookings`)).toBe(TOKEN);
  });

  it("refuses every portal page that is NOT a token", () => {
    // Each of these has something in the second segment, and none of it
    // is a token. Reading one as a token is how "/portal/card-saved"
    // once showed an error to a client who had just handed over a card.
    for (const path of [
      "/portal",
      "/portal/login",
      "/portal/card-saved",
      "/portal/card-cancelled",
      "/portal/card-link-expired",
      "/portal/invoice-paid",
      "/portal/invoice-cancelled",
      "/portal/preview/12",
      "/portal/setup/abc",
      "/portal-messages",
      "/",
    ]) {
      expect(portalAccessTokenIn(path), path).toBeNull();
    }
  });

  it("refuses anything that is not 64 hex characters", () => {
    expect(portalAccessTokenIn("/portal/" + "a".repeat(63))).toBeNull();
    expect(portalAccessTokenIn("/portal/" + "a".repeat(65))).toBeNull();
    expect(portalAccessTokenIn("/portal/" + "g".repeat(64))).toBeNull();
  });

  it("cannot be talked into escaping the JSON the server writes it into", () => {
    // The server echoes this value into a manifest document. The pattern
    // is the whole defence, so prove it holds against the shapes that
    // would matter if it did not.
    for (const nasty of [
      '/portal/"},"start_url":"https://evil.example/',
      "/portal/../../etc/passwd",
      "/portal/<script>alert(1)</script>",
      `/portal/${TOKEN}%22`,
      `/portal/${TOKEN}/../login`,
    ]) {
      expect(portalAccessTokenIn(nasty), nasty).toBeNull();
    }
  });
});

describe("where the Home Screen icon opens", () => {
  it("opens the client's own portal, not a password form", () => {
    // The whole bug, in one assertion. Renee Gannon saved a page she was
    // already reading and got a sign-in prompt for an account that does
    // not exist, because start_url said "/portal/login".
    expect(portalStartUrlFor(`/portal/${TOKEN}`)).toBe(`/portal/${TOKEN}`);
    expect(portalStartUrlFor(`/portal/${TOKEN}`)).not.toBe("/portal/login");
  });

  it("still offers sign-in to someone who arrived without a token", () => {
    expect(portalStartUrlFor("/portal/login")).toBe("/portal/login");
    expect(portalStartUrlFor("/portal")).toBe("/portal/login");
  });
});

describe("which manifest a portal page advertises", () => {
  it("gives a token page one of its own, under the token", () => {
    expect(portalManifestHrefFor(`/portal/${TOKEN}`)).toBe(
      `/portal/${TOKEN}/app.webmanifest`
    );
  });

  it("ends in a file extension, so the host redirect leaves it alone", () => {
    // portalHosting.isRoutablePage() returns false for a path whose last
    // segment has an extension. If this stopped being a ".webmanifest"
    // the request would be redirected to the portal host mid-save.
    expect(portalManifestHrefFor(`/portal/${TOKEN}`)).toMatch(
      /\.webmanifest$/
    );
  });

  it("falls back to the static one everywhere else", () => {
    expect(portalManifestHrefFor("/portal/login")).toBe(
      STATIC_PORTAL_MANIFEST_PATH
    );
    expect(portalManifestHrefFor("/portal")).toBe(STATIC_PORTAL_MANIFEST_PATH);
  });
});

describe("the manifest document", () => {
  it("keeps one app identity whatever the start_url is", () => {
    // A client issued a replacement link must not look like a second,
    // different app to their phone.
    expect(buildPortalManifest(`/portal/${TOKEN}`).id).toBe("/portal");
    expect(buildPortalManifest("/portal/login").id).toBe("/portal");
  });

  it("puts start_url inside scope, or the phone will not use it", () => {
    const manifest = buildPortalManifest(`/portal/${TOKEN}`);
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it("is named for the salon, never Groomigo", () => {
    const manifest = buildPortalManifest("/portal/login");
    expect(manifest.name).toBe("Barkin' Beautiful");
    expect(manifest.short_name).toBe("Barkin' Beautiful");
    expect(JSON.stringify(manifest)).not.toMatch(/groomigo/i);
  });

  it("matches the static file it replaces, apart from start_url", () => {
    // The static portal.webmanifest is still served to pages without a
    // token. If the two drift, a client gets a different icon or a
    // different app name depending on which page they saved from, and
    // nothing else in the suite would notice.
    const onDisk = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "client/public/portal.webmanifest"),
        "utf8"
      )
    );
    expect(buildPortalManifest(onDisk.start_url)).toEqual(onDisk);
  });
});
