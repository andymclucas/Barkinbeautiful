import { describe, expect, it, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { usePortalManifest } from "./usePortalManifest";

/**
 * Lauren, 10/11/2026, relaying a client: "went to save the site to her
 * phone. it then asked for a sign in and password which she never set
 * up."
 *
 * The page was advertising the STAFF app's manifest — every page did,
 * because index.html links one and index.html is shared — so a client
 * saving her own portal got a Groomigo icon that opened the salon's
 * staff sign-in. Not the wrong password: the wrong application.
 */

function Probe() {
  usePortalManifest();
  return null;
}

const at = (path: string) => {
  const { hook } = memoryLocation({ path });
  return render(
    <Router hook={hook}>
      <Probe />
    </Router>
  );
};

const manifestHref = () =>
  document
    .querySelector<HTMLLinkElement>('link[rel="manifest"]')
    ?.getAttribute("href") ?? "";
const appTitle = () =>
  document.querySelector<HTMLMetaElement>(
    'meta[name="apple-mobile-web-app-title"]'
  )?.content ?? "";

beforeEach(() => {
  document.head.innerHTML =
    '<link rel="manifest" href="/manifest.webmanifest">' +
    '<meta name="apple-mobile-web-app-title" content="Groomigo">';
});

/**
 * A real one. The shape matters: `portalAccessTokenIn` only accepts 64
 * hex characters, so a placeholder like "some-access-token" reads as an
 * ordinary portal page and this file would assert the static manifest
 * and pass without ever exercising the per-client one.
 */
const TOKEN = "648c6f4a01" + "b".repeat(54);

describe("which app a phone saves", () => {
  it("offers the salon's own app on a client's portal", () => {
    at(`/portal/${TOKEN}`);
    expect(manifestHref()).toContain("webmanifest");
    expect(appTitle()).toBe("Barkin' Beautiful");
  });

  it("gives a client's own page a manifest carrying their token", () => {
    // Renee Gannon, 10/11/2026, having deleted and re-saved the icon as
    // asked: "if I try to open that same link from the homescreen - it
    // asks for password." The static manifest's start_url is
    // "/portal/login", so the icon opened an account form for an
    // account she has never had. Her own page must advertise a manifest
    // whose start_url is her own page.
    at(`/portal/${TOKEN}`);
    expect(manifestHref()).toBe(`/portal/${TOKEN}/app.webmanifest`);
    expect(manifestHref()).not.toBe("/portal.webmanifest");
  });

  it("does the same on the portal login and the setup link", () => {
    // These have no token to point at, so they keep the static manifest
    // and its start_url of /portal/login — the right answer for someone
    // who arrived without a link.
    for (const path of ["/portal/login", "/portal/setup/abc123", "/portal"]) {
      document.head.innerHTML =
        '<link rel="manifest" href="/manifest.webmanifest">' +
        '<meta name="apple-mobile-web-app-title" content="Groomigo">';
      at(path);
      expect(manifestHref(), path).toContain("/portal.webmanifest");
    }
  });

  it("leaves the staff app alone", () => {
    for (const path of ["/", "/calendar", "/clients", "/workflow"]) {
      document.head.innerHTML =
        '<link rel="manifest" href="/manifest.webmanifest">' +
        '<meta name="apple-mobile-web-app-title" content="Groomigo">';
      at(path);
      expect(manifestHref(), path).toContain("/manifest.webmanifest");
      expect(appTitle(), path).toBe("Groomigo");
    }
  });

  it("does nothing at all when the page links no manifest", () => {
    // Previews and the thumbnail capture render without the real head.
    document.head.innerHTML = "";
    expect(() => at(`/portal/${TOKEN}`)).not.toThrow();
  });
});
