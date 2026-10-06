import { describe, expect, it } from "vitest";
import { hostTenantKey, normaliseHost, isUsableSlug } from "@shared/hostTenant";

const PLATFORM = "groomigo.com";

describe("tidying a hostname before anything else looks at it", () => {
  it("drops the port, the case and a trailing dot", () => {
    expect(normaliseHost("Barkin-Beautiful.Groomigo.com:443")).toBe("barkin-beautiful.groomigo.com");
    expect(normaliseHost("groomigo.com.")).toBe("groomigo.com");
  });

  it("keeps an IPv6 literal intact rather than cutting it at a colon", () => {
    // Naively splitting on ":" turns [::1] into "[".
    expect(normaliseHost("[::1]:3000")).toBe("[::1]");
  });

  it("survives nothing at all", () => {
    for (const bad of [null, undefined, "", "   "]) expect(normaliseHost(bad)).toBeNull();
  });
});

describe("a salon on the platform domain", () => {
  it("reads the slug from the subdomain", () => {
    expect(hostTenantKey("barkin-beautiful.groomigo.com", PLATFORM))
      .toEqual({ kind: "slug", slug: "barkin-beautiful" });
  });

  it("ignores the platform's own subdomains", () => {
    // app.groomigo.com must not go looking for a salon called "app".
    for (const h of ["www", "app", "api", "admin", "staff", "status"]) {
      expect(hostTenantKey(`${h}.groomigo.com`, PLATFORM), h).toBeNull();
    }
  });

  it("declines a deeper subdomain rather than guessing", () => {
    // a.b.groomigo.com is not salon "a.b" — it is something unexpected.
    expect(hostTenantKey("a.b.groomigo.com", PLATFORM)).toBeNull();
  });

  it("treats the bare platform domain as the marketing site", () => {
    expect(hostTenantKey("groomigo.com", PLATFORM)).toBeNull();
  });
});

describe("a salon on its own domain", () => {
  it("looks the whole hostname up", () => {
    // Barkin' Beautiful's real host today.
    expect(hostTenantKey("staff.barkinbeautiful.com.au", PLATFORM))
      .toEqual({ kind: "domain", domain: "staff.barkinbeautiful.com.au" });
  });

  it("strips www so one row covers both spellings", () => {
    expect(hostTenantKey("www.barkinbeautiful.com.au", PLATFORM))
      .toEqual({ kind: "domain", domain: "www.barkinbeautiful.com.au" });
  });

  it("still works when no platform domain is configured", () => {
    expect(hostTenantKey("staff.barkinbeautiful.com.au", null))
      .toEqual({ kind: "domain", domain: "staff.barkinbeautiful.com.au" });
  });
});

describe("hosts that never name a salon", () => {
  it("refuses localhost and raw addresses", () => {
    for (const h of ["localhost", "localhost:3000", "127.0.0.1", "10.0.0.14", "[::1]:3000", "0.0.0.0"]) {
      expect(hostTenantKey(h, PLATFORM), h).toBeNull();
    }
  });

  it("allows a named salon on localhost for development", () => {
    // So a developer can work on a specific salon without DNS.
    expect(hostTenantKey("barkin-beautiful.localhost:3000", PLATFORM))
      .toEqual({ kind: "slug", slug: "barkin-beautiful" });
    expect(hostTenantKey("app.localhost", PLATFORM)).toBeNull();
  });

  it("returns null for nothing at all", () => {
    expect(hostTenantKey(null, PLATFORM)).toBeNull();
    expect(hostTenantKey("", PLATFORM)).toBeNull();
  });
});

describe("slugs a salon may be given", () => {
  it("accepts ordinary ones", () => {
    expect(isUsableSlug("barkin-beautiful")).toBe(true);
    expect(isUsableSlug("paws4thought")).toBe(true);
  });

  it("refuses the platform's own names and anything malformed", () => {
    for (const bad of ["app", "api", "www", "-leading", "Has-Capitals", "has_underscore", "", "a".repeat(64)]) {
      expect(isUsableSlug(bad), bad).toBe(false);
    }
  });
});
