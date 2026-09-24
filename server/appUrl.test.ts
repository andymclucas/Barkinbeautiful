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
