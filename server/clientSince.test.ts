import { describe, it, expect } from "vitest";
import { clientSince, describeClientSince } from "@shared/clientSince";

const fmt = (d: Date) => d.toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" });

describe("clientSince", () => {
  it("uses the first visit when there is one", () => {
    const out = clientSince("2024-07-21T22:00:00.000Z");
    expect(out.known).toBe(true);
    if (out.known) expect(out.at.toISOString()).toBe("2024-07-21T22:00:00.000Z");
  });

  it("says nothing rather than falling back to the import date", () => {
    // 10,075 of 10,101 clients carry created_at = 3 Aug 2026, the day the
    // MoeGo merge ran. Showing that is worse than showing nothing.
    expect(clientSince(null).known).toBe(false);
    expect(clientSince(undefined).known).toBe(false);
    expect(clientSince("").known).toBe(false);
  });

  it("treats an unparseable value as absent, not as Invalid Date", () => {
    expect(clientSince("not a date").known).toBe(false);
  });

  it("accepts a Date as readily as a string", () => {
    expect(clientSince(new Date("2025-03-04T00:00:00Z")).known).toBe(true);
  });
});

describe("describeClientSince", () => {
  it("names both dates, because they are different facts", () => {
    const text = describeClientSince({
      firstVisit: "2024-07-21T22:00:00.000Z",
      createdAt: "2026-08-03T00:00:00.000Z",
      formatDate: fmt,
    });
    expect(text).toContain("First visit");
    expect(text).toContain("Added to the system");
  });

  it("says there are no visits rather than implying a date", () => {
    const text = describeClientSince({
      firstVisit: null, createdAt: "2026-08-03T00:00:00.000Z", formatDate: fmt,
    });
    expect(text).toContain("No visits on record");
    expect(text).toContain("Added to the system");
  });

  it("copes with neither date being present", () => {
    expect(describeClientSince({ firstVisit: null, createdAt: null, formatDate: fmt }))
      .toBe("No visits on record.");
  });
});
