import { describe, it, expect } from "vitest";
import { matchesClientSearch, searchTerms } from "@shared/clientSearchMatch";

const andy = { firstName: "Andy", lastName: "McLucas", petName: "Link" };

describe("matchesClientSearch", () => {
  it("matches the full name a staff member actually types", () => {
    // The real failure: Memberships showed "No memberships in this category"
    // for a client with an active membership, because first and last name
    // live in separate columns.
    expect(matchesClientSearch("Andy mclucas", andy)).toBe(true);
    expect(matchesClientSearch("Andy McLucas", andy)).toBe(true);
  });

  it("ignores case, order and extra whitespace", () => {
    expect(matchesClientSearch("mclucas andy", andy)).toBe(true);
    expect(matchesClientSearch("  ANDY   mclucas  ", andy)).toBe(true);
  });

  it("still matches a single name or a pet", () => {
    expect(matchesClientSearch("andy", andy)).toBe(true);
    expect(matchesClientSearch("mclucas", andy)).toBe(true);
    expect(matchesClientSearch("Link", andy)).toBe(true);
    expect(matchesClientSearch("andy link", andy)).toBe(true);
  });

  it("matches partial words", () => {
    expect(matchesClientSearch("luc", andy)).toBe(true);
  });

  it("requires every word to match something", () => {
    expect(matchesClientSearch("Andy Smith", andy)).toBe(false);
    expect(matchesClientSearch("Christie", andy)).toBe(false);
  });

  it("treats a blank search as no filter", () => {
    expect(matchesClientSearch("", andy)).toBe(true);
    expect(matchesClientSearch("   ", andy)).toBe(true);
    expect(matchesClientSearch(null, andy)).toBe(true);
  });

  it("copes with missing fields", () => {
    expect(matchesClientSearch("andy", { firstName: "Andy" })).toBe(true);
    expect(matchesClientSearch("andy", { lastName: null, petName: null })).toBe(false);
  });
});

describe("searchTerms", () => {
  it("splits on whitespace and lowercases", () => {
    expect(searchTerms("  Andy   McLucas ")).toEqual(["andy", "mclucas"]);
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms(null)).toEqual([]);
  });
});
