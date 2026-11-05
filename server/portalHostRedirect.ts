import type { NextFunction, Request, Response } from "express";
import { getAppBaseUrl, getPortalBaseUrl } from "./appUrl";
import { hostRedirectFor } from "@shared/portalHosting";

/**
 * Send each page to the host it belongs to.
 *
 * Without this, moving the portal to its own address only changes the
 * links we mint from today onward. Every link already sent by SMS or
 * email, every bookmark, and the address the salon has been reading out
 * over the phone all still point at the staff host — which is the exact
 * confusion the move is meant to end, surviving the move.
 *
 * It redirects BOTH ways. A client on the staff host is sent across, and
 * a staff member who followed an old link to a staff page on the client
 * host is sent back. One direction would just move the dead end.
 *
 * ## 302, not 301
 *
 * A permanent redirect is cached by the browser more or less for ever,
 * and by some for longer than the configuration that produced it. If the
 * split is ever reverted, or a path is reclassified, a 301 keeps sending
 * people to the old answer from a cache nobody can reach. 302 costs one
 * round trip and can be taken back.
 *
 * ## Safe before the DNS exists
 *
 * With VITE_PORTAL_URL unset, getPortalBaseUrl() returns the app URL, the
 * two hosts match, and hostRedirectFor returns null for everything. So
 * this can merge and deploy before the domain is live, and the switch is
 * the environment variable alone. Requests arriving on any other host —
 * localhost, a Render preview, the bare onrender.com address — are left
 * alone too, so development and emergency access keep working.
 *
 * Mounted after every /api route is registered, and it declines anything
 * under /api or carrying a file extension, so neither tRPC nor an asset
 * can be bounced.
 */
export function portalHostRedirect(req: Request, res: Response, next: NextFunction): void {
  // A redirect can only preserve a GET. Anything else — a form post, a
  // webhook — would lose its body, so it is served where it landed.
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const decision = hostRedirectFor({
    requestHost: req.headers.host ?? "",
    pathAndQuery: req.originalUrl || req.url || "/",
    appBaseUrl: getAppBaseUrl(),
    portalBaseUrl: getPortalBaseUrl(),
  });

  if (!decision) return next();
  res.redirect(302, decision.to);
}
