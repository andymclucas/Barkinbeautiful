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

describe("which app a phone saves", () => {
  it("offers the salon's own app on a client's portal", () => {
    at("/portal/some-access-token");
    expect(manifestHref()).toContain("/portal.webmanifest");
    expect(appTitle()).toBe("Barkin' Beautiful");
  });

  it("does the same on the portal login and the setup link", () => {
    // start_url points at the login, so saving from anywhere in the
    // portal has to land back inside the portal.
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
    expect(() => at("/portal/token")).not.toThrow();
  });
});
