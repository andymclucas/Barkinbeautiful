import { describe, expect, it } from "vitest";
import {
  RECENT_SEARCH_LIMIT, clientIdFromHref, isInAppHref, parseRecentSearches, recentSearchStorageKey, rememberSearch, type RecentSearch,
} from "./recentSearches";

const entry = (n: number, over: Partial<RecentSearch> = {}): RecentSearch => ({
  kind: "client", title: `Client ${n}`, subtitle: null, href: `/clients/${n}`, query: `c${n}`, at: n, ...over,
});

describe("rememberSearch", () => {
  it("puts the newest first", () => {
    expect(rememberSearch([entry(1)], entry(2)).map((e) => e.href)).toEqual(["/clients/2", "/clients/1"]);
  });

  it("keeps the last five that were opened", () => {
    let list: RecentSearch[] = [];
    for (let n = 1; n <= 8; n++) list = rememberSearch(list, entry(n));
    expect(list).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(list.map((e) => e.href)).toEqual(["/clients/8", "/clients/7", "/clients/6", "/clients/5", "/clients/4"]);
  });

  it("opening the same client again moves it to the top instead of listing it twice", () => {
    const list = rememberSearch([entry(1), entry(2), entry(3)], entry(3, { query: "new words" }));
    expect(list.map((e) => e.href)).toEqual(["/clients/3", "/clients/1", "/clients/2"]);
    expect(list[0].query).toBe("new words");
  });

  it("ignores an entry with no name or a link out of the app", () => {
    const start = [entry(1)];
    expect(rememberSearch(start, entry(2, { title: "  " }))).toEqual(start);
    expect(rememberSearch(start, entry(2, { href: "https://elsewhere.example" }))).toEqual(start);
  });
});

describe("isInAppHref", () => {
  it("allows app paths only", () => {
    expect(isInAppHref("/clients/5?pet=9")).toBe(true);
    expect(isInAppHref("//evil.example/x")).toBe(false);
    expect(isInAppHref("javascript:alert(1)")).toBe(false);
    expect(isInAppHref("/\\evil.example")).toBe(false);
    expect(isInAppHref(null)).toBe(false);
  });
});

describe("parseRecentSearches", () => {
  it("round-trips what was stored", () => {
    const list = [entry(2), entry(1, { kind: "pet", subtitle: "Cavoodle" })];
    expect(parseRecentSearches(JSON.stringify(list))).toEqual(list);
  });

  it("reads nothing, garbage or the wrong shape as an empty list", () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches("not json")).toEqual([]);
    expect(parseRecentSearches('{"a":1}')).toEqual([]);
  });

  it("drops malformed rows, outside links and repeats, and stops at five", () => {
    const raw = JSON.stringify([
      entry(1), { kind: "client", title: "", href: "/clients/2" }, entry(3, { href: "javascript:x" }),
      entry(4, { kind: "staff" as never }), entry(1), entry(5), entry(6), entry(7), entry(8), entry(9),
    ]);
    expect(parseRecentSearches(raw).map((e) => e.href)).toEqual(["/clients/1", "/clients/5", "/clients/6", "/clients/7", "/clients/8"]);
  });
});

describe("recentSearchStorageKey", () => {
  it("keeps each box, person and salon apart", () => {
    const keys = new Set([
      recentSearchStorageKey("global", 1, 10), recentSearchStorageKey("clients", 1, 10),
      recentSearchStorageKey("global", 2, 10), recentSearchStorageKey("global", 1, 11),
    ]);
    expect(keys.size).toBe(4);
    expect(recentSearchStorageKey("global", null, null)).toBe("gsos.recentSearches.global.anon.home");
  });
});

describe("clientIdFromHref", () => {
  it("reads the client from a client link, and nothing else", () => {
    expect(clientIdFromHref("/clients/42")).toBe(42);
    expect(clientIdFromHref("/clients/42?pet=7")).toBe(42);
    expect(clientIdFromHref("/clients/new")).toBeNull();
    expect(clientIdFromHref("tel:0412345678")).toBeNull();
    expect(clientIdFromHref("/calendar?appt=5")).toBeNull();
    expect(clientIdFromHref(null)).toBeNull();
  });
});
