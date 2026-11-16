import { describe, expect, it } from "vitest";
import {
  campaignsWithAudience,
  audienceFilterIs,
  audienceTypeForDisplay,
  audienceTypeForSend,
  readAudienceFilter,
} from "./campaignAudienceFilter";

describe("reading a saved campaign audience", () => {
  it("reads the JSON text the code writes", () => {
    expect(readAudienceFilter('{"type":"portal_no_card"}')).toEqual({ ok: true, type: "portal_no_card", source: "saved" });
  });

  it("reads the already-parsed object the live database hands back", () => {
    // 16/11/2026: this shape made every reader fall back to all_active.
    expect(readAudienceFilter({ type: "portal_no_card" })).toEqual({ ok: true, type: "portal_no_card", source: "saved" });
    expect(audienceTypeForDisplay({ type: "portal_no_card" })).toBe("portal_no_card");
  });

  it.each([null, undefined, "", "  ", "{}", {}])("treats %j as no choice made", (raw) => {
    expect(readAudienceFilter(raw)).toEqual({ ok: true, type: "all_active", source: "default" });
  });

  it.each(["not json", "[1,2]", '"text"', 42, [], { type: 7 }, { type: "" }])("says so when %j cannot be read", (raw) => {
    expect(readAudienceFilter(raw).ok).toBe(false);
    // a screen still renders
    expect(audienceTypeForDisplay(raw)).toBe("all_active");
  });
});

describe("audienceFilterIs", () => {
  it("matches a string or an object, and never throws", () => {
    expect(audienceFilterIs('{"type":"portal_invite"}', "portal_invite")).toBe(true);
    expect(audienceFilterIs({ type: "portal_invite" }, "portal_invite")).toBe(true);
    expect(audienceFilterIs({ type: "portal_no_card" }, "portal_invite")).toBe(false);
    expect(audienceFilterIs(null, "all_active")).toBe(false);
    expect(audienceFilterIs("garbage", "portal_invite")).toBe(false);
  });
});

describe("the audience a send will use", () => {
  it("returns the saved type from either shape", () => {
    expect(audienceTypeForSend({ type: "portal_no_card" })).toEqual({ ok: true, type: "portal_no_card" });
    expect(audienceTypeForSend('{"type":"membership_holders"}')).toEqual({ ok: true, type: "membership_holders" });
  });

  it("uses all_active only when nothing was chosen", () => {
    expect(audienceTypeForSend(null)).toEqual({ ok: true, type: "all_active" });
  });

  it("refuses an audience it cannot read, instead of widening it", () => {
    const r = audienceTypeForSend("garbage");
    expect(r.ok).toBe(false);
  });

  it("refuses a type it does not know, which used to mean every client", () => {
    const r = audienceTypeForSend({ type: "everyone_ever" });
    expect(r.ok).toBe(false);
    expect(audienceTypeForSend({ type: "portal_invite" }).ok).toBe(false);
  });
});

describe("finding campaigns by audience", () => {
  const rows = [
    { id: 9, audienceFilter: { type: "portal_invite" } },
    { id: 8, audienceFilter: '{"type":"portal_no_card"}' },
    { id: 7, audienceFilter: '{"type":"portal_invite"}' },
    { id: 6, audienceFilter: null },
    { id: 5, audienceFilter: "garbage" },
  ];

  it("matches the parsed object the live database returns, which a SQL text comparison cannot", () => {
    expect(campaignsWithAudience(rows, "portal_invite").map((r) => r.id)).toEqual([9, 7]);
  });

  it("keeps the order it was given, so the first is the latest", () => {
    expect(campaignsWithAudience(rows, "portal_invite")[0]?.id).toBe(9);
  });

  it("finds nothing among unrelated, empty or unreadable audiences", () => {
    expect(campaignsWithAudience(rows, "all_active")).toEqual([]);
    expect(campaignsWithAudience([], "portal_invite")).toEqual([]);
  });
});
