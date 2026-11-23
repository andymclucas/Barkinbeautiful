import { describe, expect, it } from "vitest";
import { isBoolean, isPageNumber, isShortText, oneOf, pageButtons, readSavedListView, readSavedView, type SavedListView } from "./listPaging";

describe("pageButtons", () => {
  it("shows every page when there are four, as on the Memberships list", () => {
    expect(pageButtons(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pageButtons(3, 4)).toEqual([1, 2, 3, 4]);
  });

  it("shows a single page for an empty or one-page list", () => {
    expect(pageButtons(1, 0)).toEqual([1]);
    expect(pageButtons(1, 1)).toEqual([1]);
  });

  it("shows up to seven pages in full", () => {
    expect(pageButtons(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("skips the middle of a long list around the current page", () => {
    expect(pageButtons(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
  });

  it("fills the start and the end so the row does not jump about", () => {
    expect(pageButtons(1, 20)).toEqual([1, 2, 3, 4, "gap", 20]);
    expect(pageButtons(20, 20)).toEqual([1, "gap", 17, 18, 19, 20]);
  });

  it("clamps a page beyond the end", () => {
    expect(pageButtons(9, 4)).toEqual([1, 2, 3, 4]);
  });
});

describe("readSavedListView", () => {
  const defaults: SavedListView = { page: 1, tab: "active", tier: "all", search: "", sortKey: "client", sortDir: "asc" };
  const allowed = { tabs: ["active", "paused"], tiers: ["all", "silver"], sortKeys: ["client", "price"] };

  it("brings back the page, tab, filters and sort that were saved", () => {
    const saved = { page: 3, tab: "paused", tier: "silver", search: "spencer", sortKey: "price", sortDir: "desc" };
    expect(readSavedListView(JSON.stringify(saved), defaults, allowed)).toEqual(saved);
  });

  it("falls back to the defaults when nothing or garbage is stored", () => {
    expect(readSavedListView(null, defaults, allowed)).toEqual(defaults);
    expect(readSavedListView("{not json", defaults, allowed)).toEqual(defaults);
    expect(readSavedListView("42", defaults, allowed)).toEqual(defaults);
  });

  it("drops any one field that does not check out and keeps the rest", () => {
    const saved = { page: -2, tab: "deleted", tier: "silver", search: 7, sortKey: "x", sortDir: "up" };
    expect(readSavedListView(JSON.stringify(saved), defaults, allowed)).toEqual({ ...defaults, tier: "silver" });
  });
});

describe("readSavedView", () => {
  const defaults = { page: 1, status: "active", search: "", onlyOverdue: false };
  const checks = { page: isPageNumber, status: oneOf(["active", "all"]), search: isShortText, onlyOverdue: isBoolean };

  it("brings back every field that checks out", () => {
    const saved = { page: 12, status: "all", search: "bella", onlyOverdue: true };
    expect(readSavedView(JSON.stringify(saved), defaults, checks)).toEqual(saved);
  });

  it("keeps the default for a field that is missing or wrong", () => {
    expect(readSavedView(JSON.stringify({ page: 0, status: "gone", onlyOverdue: "yes" }), defaults, checks)).toEqual(defaults);
  });

  it("ignores fields it was not asked about", () => {
    expect(readSavedView(JSON.stringify({ page: 2, extra: "x" }), defaults, checks)).toEqual({ ...defaults, page: 2 });
  });

  it("falls back on garbage", () => {
    expect(readSavedView("[1,2]", defaults, checks)).toEqual(defaults);
    expect(readSavedView("nope", defaults, checks)).toEqual(defaults);
  });
});
