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

describe("stage 2: sorting", () => {
  it("normaliseTriage keeps known labels, trims the summary and only trusts a duplicate it was shown", async () => {
    const { normaliseTriage } = await import("@shared/issueReports");
    expect(normaliseTriage({ category: "bug", urgency: "urgent", summary: "  Send   does nothing ", duplicate_of: 4 }, [4, 5], 9))
      .toEqual({ category: "bug", urgency: "urgent", summary: "Send does nothing", duplicateOfId: 4 });
    expect(normaliseTriage({ category: "bug", urgency: "low", summary: "x", duplicate_of: 77 }, [4], 9)?.duplicateOfId).toBeNull();
    expect(normaliseTriage({ category: "bug", urgency: "low", summary: "x", duplicate_of: 9 }, [9], 9)?.duplicateOfId).toBeNull();
    expect(normaliseTriage({ category: "complaint", urgency: "low", summary: "x", duplicate_of: null }, [], 9)).toBeNull();
    expect(normaliseTriage({ category: "bug", urgency: "low", summary: "   ", duplicate_of: null }, [], 9)).toBeNull();
    expect(normaliseTriage({ category: "bug", urgency: "low", summary: "y".repeat(300), duplicate_of: null }, [], 9)!.summary.length).toBe(200);
  });

  it("sortReportsForInbox puts open urgent reports first, unsorted counts as normal, closed last", async () => {
    const { sortReportsForInbox } = await import("@shared/issueReports");
    const rows = [
      { id: 1, status: "new" as const, urgency: "low" as const, createdAt: "2026-11-11T05:00:00Z" },
      { id: 2, status: "fixed" as const, urgency: "urgent" as const, createdAt: "2026-11-11T06:00:00Z" },
      { id: 3, status: "in_progress" as const, urgency: "urgent" as const, createdAt: "2026-11-10T00:00:00Z" },
      { id: 4, status: "new" as const, urgency: null, createdAt: "2026-11-11T04:00:00Z" },
      { id: 5, status: "new" as const, urgency: "normal" as const, createdAt: "2026-11-11T07:00:00Z" },
    ];
    expect(sortReportsForInbox(rows).map((r) => r.id)).toEqual([3, 5, 4, 1, 2]);
  });

  it("issuePushText says URGENT and uses the summary once sorted", async () => {
    const { issuePushText } = await import("@shared/issueReports");
    expect(issuePushText("Lauren", "long rambling message", { urgency: "urgent", summary: "Can't check dogs in" }))
      .toEqual({ title: "URGENT — Lauren reported a problem", body: "Can't check dogs in" });
    expect(issuePushText("Lauren", "msg", { urgency: "low", summary: "Button colour" }).title).toBe("Lauren reported a problem");
  });
});

describe("stage 2: telling the reporter", () => {
  it("shows an outcome the owners set that the reporter has not seen", async () => {
    const { hasUnseenOutcome } = await import("@shared/issueReports");
    const base = { reporterUserId: 7, statusChangedByUserId: 30001, statusChangedAt: "2026-11-11T05:00:00Z", reporterSeenAt: null };
    expect(hasUnseenOutcome({ ...base, status: "fixed" })).toBe(true);
    expect(hasUnseenOutcome({ ...base, status: "new" })).toBe(false);
    expect(hasUnseenOutcome({ ...base, status: "fixed", reporterSeenAt: "2026-11-11T06:00:00Z" })).toBe(false);
    // Seen while "working on it", then fixed later: news again.
    expect(hasUnseenOutcome({ ...base, status: "fixed", reporterSeenAt: "2026-11-11T04:00:00Z" })).toBe(true);
    // Their own change is not news to them.
    expect(hasUnseenOutcome({ ...base, status: "dismissed", statusChangedByUserId: 7 })).toBe(false);
  });
});

describe("stage 2: video", () => {
  it("counts pieces and recognises video keys", async () => {
    const { videoChunkCount, isIssueVideoKey, ISSUE_VIDEO_CHUNK_BYTES, isIssueVideoType } = await import("@shared/issueReports");
    expect(videoChunkCount(1)).toBe(1);
    expect(videoChunkCount(ISSUE_VIDEO_CHUNK_BYTES)).toBe(1);
    expect(videoChunkCount(ISSUE_VIDEO_CHUNK_BYTES + 1)).toBe(2);
    expect(isIssueVideoKey("issue-reports/video-1731300000-abc")).toBe(true);
    expect(isIssueVideoKey("issue-reports/1.jpg")).toBe(false);
    expect(isIssueVideoType("video/quicktime")).toBe(true);
    expect(isIssueVideoType("image/svg+xml")).toBe(false);
  });
});
