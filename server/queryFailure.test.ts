import { describe, it, expect } from "vitest";
import {
  describeQueryPath,
  failureNotice,
  isAuthFailure,
  shouldAnnounce,
} from "@shared/queryFailure";

const UNAUTHED = "You must be logged in to do that";

describe("isAuthFailure", () => {
  it("recognises an expired session", () => {
    // Worth skipping: on a logout every query in flight fails at once, and
    // reporting them would bury real failures under a dozen rows a time.
    expect(isAuthFailure({ message: UNAUTHED }, UNAUTHED)).toBe(true);
    expect(isAuthFailure({ message: "UNAUTHORIZED" }, UNAUTHED)).toBe(true);
    expect(isAuthFailure({ httpStatus: 401 }, UNAUTHED)).toBe(true);
    expect(isAuthFailure({ httpStatus: 403 }, UNAUTHED)).toBe(true);
  });

  it("does not swallow a genuine server error", () => {
    expect(isAuthFailure({ httpStatus: 500, message: "Failed query" }, UNAUTHED)).toBe(false);
    expect(isAuthFailure({}, UNAUTHED)).toBe(false);
  });
});

describe("describeQueryPath", () => {
  it("names the thing in words a groomer would use", () => {
    expect(describeQueryPath("analyticsExt.netSalesPerformance")).toBe("Net sales performance");
    expect(describeQueryPath("calendar.getMembershipCoverage")).toBe("Membership coverage");
    expect(describeQueryPath("sms.listThreads")).toBe("Threads");
  });

  it("falls back rather than showing an empty label", () => {
    expect(describeQueryPath(null)).toBe("Some data");
    expect(describeQueryPath("")).toBe("Some data");
    // A procedure called exactly "get" strips to nothing; it must not
    // produce "" could not be loaded.
    expect(describeQueryPath("x.get")).toBe("Some data");
  });
});

describe("failureNotice", () => {
  it("says it failed, not that it is empty", () => {
    // The whole point. "No sales in this period" was on screen for months
    // while the query was being rejected on every load.
    const notice = failureNotice(
      { message: "Failed query", path: "analyticsExt.netSalesPerformance", httpStatus: 500 },
      UNAUTHED,
    );
    expect(notice.report).toBe(true);
    expect(notice.message).toContain("Net sales performance");
    expect(notice.message).toContain("not empty");
  });

  it("does not blame the salon's internet", () => {
    // A 500 is this app's fault. "Check your connection" sends somebody to
    // reboot a router over a bug in here.
    const notice = failureNotice({ path: "a.b", httpStatus: 500 }, UNAUTHED);
    expect(notice.message.toLowerCase()).not.toContain("connection");
    expect(notice.message.toLowerCase()).not.toContain("internet");
    expect(notice.message.toLowerCase()).not.toContain("offline");
  });

  it("stays quiet about an expired session", () => {
    expect(failureNotice({ message: UNAUTHED }, UNAUTHED).report).toBe(false);
  });

  it("groups by procedure so repeats collapse", () => {
    const a = failureNotice({ path: "x.y", httpStatus: 500 }, UNAUTHED);
    const b = failureNotice({ path: "x.y", httpStatus: 503 }, UNAUTHED);
    expect(a.key).toBe(b.key);
  });
});

describe("shouldAnnounce", () => {
  it("announces a failure the first time", () => {
    expect(shouldAnnounce(new Map(), "x.y", 1_000)).toBe(true);
  });

  it("stays quiet on a repeat within the window", () => {
    // The dashboard fires eleven queries in one batch. When the server is
    // unwell they fail together, and eleven stacked toasts teach staff to
    // dismiss without reading.
    const seen = new Map<string, number>();
    expect(shouldAnnounce(seen, "x.y", 1_000)).toBe(true);
    expect(shouldAnnounce(seen, "x.y", 5_000)).toBe(false);
    expect(shouldAnnounce(seen, "x.y", 30_500)).toBe(false);
  });

  it("speaks up again once the window has passed", () => {
    const seen = new Map<string, number>();
    shouldAnnounce(seen, "x.y", 1_000);
    expect(shouldAnnounce(seen, "x.y", 31_001)).toBe(true);
  });

  it("treats different procedures separately", () => {
    const seen = new Map<string, number>();
    expect(shouldAnnounce(seen, "a.b", 1_000)).toBe(true);
    expect(shouldAnnounce(seen, "c.d", 1_000)).toBe(true);
  });
});
