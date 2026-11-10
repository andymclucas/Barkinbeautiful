import { useEffect } from "react";
import { useLocation } from "wouter";
import { audienceForPath } from "@shared/portalHosting";
import {
  portalManifestHrefFor,
  STAFF_MANIFEST_PATH,
} from "@shared/portalManifest";

/**
 * Which app a phone saves when somebody presses "Add to Home Screen".
 *
 * Lauren, 10/11/2026, relaying a client: "sent the client an invite, she
 * opened it and it was amazing from her phone. looked at everything. But
 * then went to save the site to her phone. it then asked for a sign in
 * and password which she never set up."
 *
 * The page advertised the STAFF app's manifest, which every page did,
 * because index.html links one and index.html is shared. Its start_url
 * is "/" and its name is "Groomigo" — so a client who saved her own
 * portal got a Groomigo icon that opened the salon's staff sign-in. Not
 * the wrong password: the wrong application.
 *
 * iOS and Android both read the manifest at the moment of saving, so
 * swapping the link while a client is on a portal page is enough: the
 * icon, the name and the start_url all come from the portal manifest
 * instead.
 *
 * `audienceForPath` is the same function the host redirect uses, so
 * "which pages are the client's" has one answer. A page that is staff's
 * keeps the staff manifest, which is every page outside /portal.
 *
 * That fixed the icon's identity and not where it pointed. Renee, the
 * same client, the next morning: "I deleted the previous link we saved
 * to Home Screen. Opened new email and saved that to Home Screen... if
 * I try to open that same link from the homescreen — it asks for
 * password." The portal manifest's start_url was "/portal/login", so
 * the icon opened an account form for an account she has never had.
 * `portalManifestHrefFor` now hands a token page a manifest of its own
 * whose start_url is that page. See `shared/portalManifest.ts`.
 */
export function usePortalManifest(): void {
  const [location] = useLocation();

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]'
    );
    if (!link) return;

    const audience = audienceForPath(location);
    const wanted =
      audience === "client"
        ? portalManifestHrefFor(location)
        : STAFF_MANIFEST_PATH;
    // Compared against the resolved href, because the attribute is a path
    // and the property is absolute.
    if (!link.href.endsWith(wanted)) link.href = wanted;

    /*
     * The title a phone offers as the icon's name. iOS reads this
     * meta before the manifest's short_name on older versions, so a
     * client saving the portal would otherwise be offered "Groomigo"
     * to name their salon's app.
     */
    const appTitle = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]'
    );
    if (appTitle) {
      appTitle.content =
        audience === "client" ? "Barkin' Beautiful" : "Groomigo";
    }
  }, [location]);
}
