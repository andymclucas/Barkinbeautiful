import { describe, expect, it } from "vitest";
import {
  issueContextFromLocation, recentIssueErrors, isIssueImageKey, issuePushText,
  isOpenIssue, ISSUE_MAX_RECENT_ERRORS,
} from "@shared/issueReports";

describe("issueContextFromLocation", () => {
  it("reads the client from a client page", () => {
    expect(issueContextFromLocation("/clients/1162", "")).toEqual({ clientId: 1162 });
  });

  it("reads the staff member from a review page", () => {
    expect(issueContextFromLocation("/staff/review/7", "").staffId).toBe(7);
  });

  it("reads records and the diary day from the query string, and keeps it whole", () => {
    const c = issueContextFromLocation("/calendar", "?date=2026-11-12&appointment=3000002&view=day");
    expect(c.appointmentId).toBe(3000002);
    expect(c.date).toBe("2026-11-12");
    expect(c.search).toBe("?date=2026-11-12&appointment=3000002&view=day");
  });

  it("prefers the path over a query parameter for the same record", () => {
    expect(issueContextFromLocation("/clients/5", "?clientId=9").clientId).toBe(5);
  });

  it("ignores things that are not ids", () => {
    const c = issueContextFromLocation("/clients/overdue", "?clientId=abc&date=12/11/2026&petId=0");
    expect(c.clientId).toBeUndefined();
    expect(c.petId).toBeUndefined();
    expect(c.date).toBeUndefined();
  });
});

describe("recentIssueErrors", () => {
  const now = Date.parse("2026-11-11T03:00:00Z");
  const at = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

  it("keeps the last fifteen minutes only", () => {
    const kept = recentIssueErrors([
      { kind: "window_error", message: "old", at: at(30) },
      { kind: "trpc_mutation_error", message: "new", at: at(2) },
    ], now);
    expect(kept.map((e) => e.message)).toEqual(["new"]);
  });

  it("caps the count, keeping the newest", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ kind: "x", message: String(i), at: at(1) }));
    const kept = recentIssueErrors(many, now);
    expect(kept).toHaveLength(ISSUE_MAX_RECENT_ERRORS);
    expect(kept.at(-1)?.message).toBe("24");
  });

  it("drops rows with no usable time", () => {
    expect(recentIssueErrors([{ kind: "x", message: "y", at: "nonsense" }], now)).toEqual([]);
  });
});

describe("issue image keys", () => {
  it("accepts only this feature's own keys", () => {
    expect(isIssueImageKey("issue-reports/1731300000-abc.jpg")).toBe(true);
    expect(isIssueImageKey("style-notes/photos/1.jpg")).toBe(false);
    expect(isIssueImageKey("issue-reports/../style-notes/1.jpg")).toBe(false);
  });
});

describe("issuePushText", () => {
  it("names the reporter and quotes the first line", () => {
    expect(issuePushText("Lauren Romari", "Can't send email\nTried twice")).toEqual({
      title: "Lauren Romari reported a problem",
      body: "Can't send email",
    });
  });

  it("copes with no name and a long first line", () => {
    const t = issuePushText(null, "x".repeat(300));
    expect(t.title).toBe("A staff member reported a problem");
    expect(t.body.length).toBe(140);
  });
});

describe("isOpenIssue", () => {
  it("treats new and in progress as open", () => {
    expect(isOpenIssue("new")).toBe(true);
    expect(isOpenIssue("in_progress")).toBe(true);
    expect(isOpenIssue("fixed")).toBe(false);
    expect(isOpenIssue("dismissed")).toBe(false);
  });
});

describe("isSafeAppPath / isSafeQuery", () => {
  it("accepts the app's own paths and query strings", async () => {
    const { isSafeAppPath, isSafeQuery } = await import("@shared/issueReports");
    expect(isSafeAppPath("/clients/1162")).toBe(true);
    expect(isSafeAppPath("/")).toBe(true);
    expect(isSafeQuery("?date=2026-11-12&appointment=3")).toBe(true);
  });

  it("refuses anything that could leave the app or run", async () => {
    const { isSafeAppPath, isSafeQuery } = await import("@shared/issueReports");
    for (const bad of ["javascript:alert(1)", "//evil.example/x", "/\\evil.example", "https://evil.example", "clients/1", "/a b", ""]) {
      expect(isSafeAppPath(bad), bad).toBe(false);
    }
    expect(isSafeQuery("javascript:alert(1)")).toBe(false);
    expect(isSafeQuery("? x")).toBe(false);
  });
});
