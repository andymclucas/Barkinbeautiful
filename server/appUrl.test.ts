import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTION_APP_URL } from "../shared/const";

/**
 * getAppBaseUrl() memoises its "already warned" flags at module scope, so each
 * test imports a fresh copy via vi.resetModules() to observe the logging.
 */
async function freshGetAppBaseUrl() {
  vi.resetModules();
  const mod = await import("./appUrl");
  return mod.getAppBaseUrl;
}

const ORIGINAL = process.env.VITE_APP_URL;

beforeEach(() => {
  delete process.env.VITE_APP_URL;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.VITE_APP_URL;
  else process.env.VITE_APP_URL = ORIGINAL;
  vi.restoreAllMocks();
});

describe("getAppBaseUrl", () => {
  it("returns the configured VITE_APP_URL", async () => {
    process.env.VITE_APP_URL = "https://staff.barkinbeautiful.com.au";
    const getAppBaseUrl = await freshGetAppBaseUrl();
    expect(getAppBaseUrl()).toBe("https://staff.barkinbeautiful.com.au");
  });

  it("strips trailing slashes so interpolated links never contain a double slash", async () => {
    process.env.VITE_APP_URL = "https://staff.barkinbeautiful.com.au///";
    const getAppBaseUrl = await freshGetAppBaseUrl();
    expect(getAppBaseUrl()).toBe("https://staff.barkinbeautiful.com.au");
    expect(`${getAppBaseUrl()}/track/abc123`).toBe(
      "https://staff.barkinbeautiful.com.au/track/abc123",
    );
  });

  it("trims surrounding whitespace from the configured value", async () => {
    process.env.VITE_APP_URL = "  https://staff.barkinbeautiful.com.au  ";
    const getAppBaseUrl = await freshGetAppBaseUrl();
    expect(getAppBaseUrl()).toBe("https://staff.barkinbeautiful.com.au");
  });

  it("never returns the decommissioned Manus host when unset", async () => {
    const getAppBaseUrl = await freshGetAppBaseUrl();
    const result = getAppBaseUrl();
    expect(result).toBe(PRODUCTION_APP_URL);
    expect(result).not.toContain("manus.space");
  });

  it("logs an error when VITE_APP_URL is missing, so misconfiguration is visible", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const getAppBaseUrl = await freshGetAppBaseUrl();
    getAppBaseUrl();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain("VITE_APP_URL is not set");
  });

  it("only warns once, however many links are generated", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const getAppBaseUrl = await freshGetAppBaseUrl();
    getAppBaseUrl();
    getAppBaseUrl();
    getAppBaseUrl();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("falls back and warns when VITE_APP_URL is not a valid URL", async () => {
    process.env.VITE_APP_URL = "not a url";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const getAppBaseUrl = await freshGetAppBaseUrl();
    expect(getAppBaseUrl()).toBe(PRODUCTION_APP_URL);
    expect(spy.mock.calls[0]?.[0]).toContain("not a valid URL");
  });

  it("rejects a non-http protocol rather than building unusable links", async () => {
    process.env.VITE_APP_URL = "ftp://staff.barkinbeautiful.com.au";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const getAppBaseUrl = await freshGetAppBaseUrl();
    expect(getAppBaseUrl()).toBe(PRODUCTION_APP_URL);
    expect(spy.mock.calls[0]?.[0]).toContain("unsupported protocol");
  });

  it("accepts plain http, for local development", async () => {
    process.env.VITE_APP_URL = "http://localhost:3000";
    const getAppBaseUrl = await freshGetAppBaseUrl();
    expect(getAppBaseUrl()).toBe("http://localhost:3000");
  });

  it("treats an empty or whitespace-only value as unset", async () => {
    process.env.VITE_APP_URL = "   ";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const getAppBaseUrl = await freshGetAppBaseUrl();
    expect(getAppBaseUrl()).toBe(PRODUCTION_APP_URL);
  });
});

describe("getPortalBaseUrl", () => {
  const saved = { app: process.env.VITE_APP_URL, portal: process.env.VITE_PORTAL_URL };
  afterEach(() => {
    process.env.VITE_APP_URL = saved.app;
    process.env.VITE_PORTAL_URL = saved.portal;
    if (saved.portal === undefined) delete process.env.VITE_PORTAL_URL;
  });

  it("sends clients to their own host when one is set", async () => {
    process.env.VITE_APP_URL = "https://staff.barkinbeautiful.com.au";
    process.env.VITE_PORTAL_URL = "https://clients.barkinbeautiful.com.au";
    const { getPortalBaseUrl } = await import("./appUrl");
    expect(getPortalBaseUrl()).toBe("https://clients.barkinbeautiful.com.au");
  });

  it("strips a trailing slash, like its sibling", async () => {
    process.env.VITE_PORTAL_URL = "https://clients.barkinbeautiful.com.au/";
    const { getPortalBaseUrl } = await import("./appUrl");
    expect(getPortalBaseUrl()).toBe("https://clients.barkinbeautiful.com.au");
  });

  /**
   * Until DNS and Render know the new name, a link to a host that does
   * not resolve is worse than one that does. The staff host at least
   * serves the portal.
   */
  it("falls back to the staff host when unset", async () => {
    process.env.VITE_APP_URL = "https://staff.barkinbeautiful.com.au";
    delete process.env.VITE_PORTAL_URL;
    const { getPortalBaseUrl } = await import("./appUrl");
    expect(getPortalBaseUrl()).toBe("https://staff.barkinbeautiful.com.au");
  });

  it("falls back rather than emitting a broken link", async () => {
    process.env.VITE_APP_URL = "https://staff.barkinbeautiful.com.au";
    for (const bad of ["not a url", "ftp://clients.example.com", "   "]) {
      process.env.VITE_PORTAL_URL = bad;
      const { getPortalBaseUrl } = await import("./appUrl");
      expect(getPortalBaseUrl(), bad).toBe("https://staff.barkinbeautiful.com.au");
    }
  });
});
