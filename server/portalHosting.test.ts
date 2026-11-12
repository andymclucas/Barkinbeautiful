import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  audienceForPath,
  hostRedirectFor,
  isRoutablePage,
  hostOf,
  type PortalAudience,
} from "@shared/portalHosting";

const APP = "https://staff.barkinbeautiful.com.au";
const PORTAL = "https://client.barkinbeautiful.com.au";

describe("which door a page belongs to", () => {
  it("puts the client portal and the links we text people on the client host", () => {
    for (const path of [
      "/portal", "/portal/login", "/portal/setup/abc123",
      "/portal/invoice-paid", "/portal/card-saved", "/portal/legacytoken",
      "/track/abc123", "/photo/abc123", "/slot/abc123", "/card/abc123",
    ]) {
      expect(audienceForPath(path), path).toBe("client");
    }
  });

  it("keeps the admin's preview of a client portal on the staff host", () => {
    // An admin looking at a client's portal from the client record. Sending
    // it across would hand staff a page their session cannot open.
    expect(audienceForPath("/portal/preview/1162")).toBe("staff");
  });

  it("does not mistake /portal-messages for the client portal", () => {
    // The staff inbox for portal messages. It starts with the seven
    // characters "/portal" and has nothing to do with the client portal,
    // which is why this matches whole segments rather than prefixes.
    expect(audienceForPath("/portal-messages")).toBe("staff");
  });

  it("leaves every staff screen alone", () => {
    for (const path of [
      "/", "/calendar", "/workflow", "/clients", "/clients/19", "/memberships",
      "/reporting", "/settings", "/login", "/staff-invite/abc", "/my-day",
    ]) {
      expect(audienceForPath(path), path).toBe("staff");
    }
  });

  it("ignores a trailing slash, case and a query string", () => {
    expect(audienceForPath("/Portal/Login/")).toBe("client");
    expect(audienceForPath("/portal?x=1")).toBe("client");
    expect(audienceForPath("/")).toBe("staff");
  });

  it("classifies EVERY route the app declares, so a new one cannot default silently", () => {
    /*
     * The real risk here is not a wrong answer, it is an unconsidered one:
     * anything unknown falls through to "staff", so a client-facing route
     * added next year would quietly keep serving on the staff host and
     * nobody would hear about it until a client rang.
     *
     * This reads the router and fails on any path not listed below, which
     * turns that silence into a decision somebody has to make here.
     */
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    const declared = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(30);

    const expected: Record<string, PortalAudience> = {
      "/": "staff", "/christmas": "staff", "/calendar": "staff", "/workflow": "staff",
      "/workflow/display": "staff", "/my-day": "staff", "/clients": "staff",
      "/clients/overdue": "staff", "/clients/:id": "staff", "/memberships": "staff",
      "/pricing": "staff", "/retail": "staff", "/counter": "staff", "/issues": "staff", "/support": "staff", "/analytics": "staff",
      "/staff/review/:staffId": "staff", "/staff": "staff", "/messages": "staff",
      "/portal-messages": "staff", "/email-campaigns": "staff", "/reporting": "staff",
      "/migration": "staff", "/settings": "staff", "/login": "staff", "/signup": "staff",
      "/staff-invite/:token": "staff", "/book/preview": "staff",
      "/portal/preview/:previewClientId": "staff",
      "/dashboard": "staff", "/home": "staff", "/appointments": "staff",
      // Public entry points. Deliberately NOT moved: they may be printed on
      // the salon's website or a card, so changing their address is a
      // business decision rather than a routing one.
      "/book": "staff", "/join": "staff", "/waitlist": "staff",
      // The client portal and everything we text a client.
      "/portal": "client", "/portal/login": "client", "/portal/setup/:token": "client", "/portal/signin/:token": "client",
      "/portal/invoice-paid": "client", "/portal/invoice-cancelled": "client",
      "/portal/card-saved": "client", "/portal/card-cancelled": "client",
      // Where /card/<token> lands a client whose link will not verify or
      // has run out. A client page like its two siblings above.
      "/portal/card-link-expired": "client",
      "/portal/:token": "client", "/track/:token": "client", "/photo/:token": "client",
      "/slot/:token": "client", "/card/:token": "client",
      "/quote/:token": "client",
      "/sign/:token": "client",
    };

    const unlisted = declared.filter((p) => !(p in expected));
    expect(unlisted, "a new route needs a side — add it to this map").toEqual([]);
    for (const path of declared) {
      expect(audienceForPath(path), path).toBe(expected[path]);
    }
  });
});

describe("what never gets redirected", () => {
  it("leaves the API alone, or tRPC would be bounced mid-call", () => {
    expect(isRoutablePage("/api/trpc/clients.list")).toBe(false);
    expect(isRoutablePage("/api/stripe/webhook")).toBe(false);
    expect(isRoutablePage("/api")).toBe(false);
  });

  it("leaves assets alone", () => {
    expect(isRoutablePage("/assets/index-BrJP6kvU.js")).toBe(false);
    expect(isRoutablePage("/favicon.ico")).toBe(false);
    expect(isRoutablePage("/voicemail-greeting.wav")).toBe(false);
    expect(isRoutablePage("/portal/login")).toBe(true);
  });
});

describe("the redirect decision", () => {
  const base = { appBaseUrl: APP, portalBaseUrl: PORTAL };

  it("does nothing at all until the portal has its own host", () => {
    // This is what makes it safe to deploy before the DNS exists.
    expect(hostRedirectFor({
      requestHost: "staff.barkinbeautiful.com.au", pathAndQuery: "/portal/login",
      appBaseUrl: APP, portalBaseUrl: APP,
    })).toBeNull();
  });

  it("sends a client off the staff host", () => {
    expect(hostRedirectFor({ ...base, requestHost: "staff.barkinbeautiful.com.au", pathAndQuery: "/portal/login" }))
      .toEqual({ to: `${PORTAL}/portal/login` });
  });

  it("sends staff back off the client host", () => {
    // Both ways, or the dead end just moves.
    expect(hostRedirectFor({ ...base, requestHost: "client.barkinbeautiful.com.au", pathAndQuery: "/calendar" }))
      .toEqual({ to: `${APP}/calendar` });
  });

  it("keeps the query string, which is where Stripe puts its answer", () => {
    expect(hostRedirectFor({ ...base, requestHost: "staff.barkinbeautiful.com.au", pathAndQuery: "/portal/card-saved?setup_intent=seti_123" }))
      .toEqual({ to: `${PORTAL}/portal/card-saved?setup_intent=seti_123` });
  });

  it("does not bounce a page that is already on the right host", () => {
    expect(hostRedirectFor({ ...base, requestHost: "client.barkinbeautiful.com.au", pathAndQuery: "/portal/login" })).toBeNull();
    expect(hostRedirectFor({ ...base, requestHost: "staff.barkinbeautiful.com.au", pathAndQuery: "/calendar" })).toBeNull();
  });

  it("cannot loop", () => {
    // Follow the redirect and the next decision must be null.
    const first = hostRedirectFor({ ...base, requestHost: "staff.barkinbeautiful.com.au", pathAndQuery: "/portal" });
    expect(first).not.toBeNull();
    const landed = hostOf(first!.to)!;
    expect(hostRedirectFor({ ...base, requestHost: landed, pathAndQuery: "/portal" })).toBeNull();
  });

  it("leaves localhost, previews and the bare render address serving everything", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "groomigo-abc.onrender.com"]) {
      expect(hostRedirectFor({ ...base, requestHost: host, pathAndQuery: "/portal/login" }), host).toBeNull();
      expect(hostRedirectFor({ ...base, requestHost: host, pathAndQuery: "/calendar" }), host).toBeNull();
    }
  });

  it("never redirects the API or an asset even across hosts", () => {
    expect(hostRedirectFor({ ...base, requestHost: "client.barkinbeautiful.com.au", pathAndQuery: "/api/trpc/clientPortal.getMyPortal" })).toBeNull();
    expect(hostRedirectFor({ ...base, requestHost: "client.barkinbeautiful.com.au", pathAndQuery: "/assets/index-abc.js" })).toBeNull();
  });

  it("survives a malformed configured URL rather than throwing", () => {
    expect(hostRedirectFor({ requestHost: "staff.barkinbeautiful.com.au", pathAndQuery: "/portal", appBaseUrl: APP, portalBaseUrl: "not a url" })).toBeNull();
  });
});

describe("which helper each link is built from", () => {
  /** Source with comments removed, so a comment naming a helper cannot trip these. */
  function code(path: string): string {
    return readFileSync(resolve(process.cwd(), path), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  const CLIENT_LINK_FILES = [
    "server/routers.ts",
    "server/stripeCards.ts",
    "server/routers/clientPhotos.ts",
    "server/routers/waitlist.ts",
    "server/routers/payments.ts",
  ];

  it("never builds a client page's URL from the staff host", () => {
    /*
     * The one that matters. Every one of these paths is a page a CLIENT
     * opens — the Pet Tracker from a text, the photo request, the waitlist
     * offer, the shared grooming card, the portal itself. Built from
     * getAppBaseUrl they would keep landing people on the staff sign-in,
     * which is the whole thing this move exists to stop, surviving the
     * move.
     */
    for (const file of CLIENT_LINK_FILES) {
      expect(code(file), file).not.toMatch(/getAppBaseUrl\(\)\s*\}?\s*[`"']?\/(track|portal|photo|slot|card)\//);
    }
  });

  it("keeps the staff links on the staff host", () => {
    // The mirror image: moving these would send a groomer accepting an
    // invitation, or an owner resetting their own password, to a host
    // their session does not exist on.
    const routers = code("server/routers.ts");
    expect(routers).toContain("`${getAppBaseUrl()}/staff-invite/");
    expect(code("server/routers/auth.ts")).toContain("`${getAppBaseUrl()}/login?reset=");
  });

  it("pins the files still allowed to mint a staff-host link", () => {
    /*
     * Counting rather than spot-checking, so a NEW link added with the
     * wrong helper shows up here as an unexpected file rather than
     * passing unnoticed. If this fails, decide which host the new link
     * belongs on and add it — do not simply extend the list.
     */
    const allowed = new Set([
      "server/_core/index.ts",            // the voicemail .wav Twilio fetches
      "server/portalHostRedirect.ts",     // needs both, to compare them
      "server/routers.ts",                // sign-in URL, staff invite, staff invoice checkout
      "server/routers/auth.ts",           // STAFF password reset, to /login
      "server/sms.ts",                    // Twilio status callback, server to server
      "server/stripeConnectAccounts.ts",  // Stripe onboarding, done by the owner
    ]);
    const files = [
      ...CLIENT_LINK_FILES,
      "server/_core/index.ts", "server/portalHostRedirect.ts",
      "server/routers/auth.ts", "server/sms.ts", "server/stripeConnectAccounts.ts",
    ];
    const using = files.filter((f) => code(f).includes("getAppBaseUrl()"));
    expect(using.filter((f) => !allowed.has(f))).toEqual([]);
  });
});
