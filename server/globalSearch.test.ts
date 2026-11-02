import { describe, expect, it } from "vitest";
import {
  appointmentHref, groupLabel, isOnTheFloor, looksLikePhone,
  matchRank, normalisePhone, rankHits, type SearchHit,
} from "@shared/globalSearch";

const hit = (over: Partial<SearchHit>): SearchHit => ({
  kind: "pet", id: 1, title: "Bella", subtitle: null, matchedOn: null, href: "/", ...over,
});

describe("matchRank", () => {
  it("puts an exact match first, then prefix, then word start, then anywhere", () => {
    expect(matchRank("Bella", "bella")).toBe(0);
    expect(matchRank("Bellatrix", "bella")).toBe(1);
    expect(matchRank("Little Bella", "bella")).toBe(2);
    expect(matchRank("Isabella", "bella")).toBe(3);
    expect(matchRank("Rufus", "bella")).toBe(99);
  });

  it("is unbothered by case and padding", () => {
    expect(matchRank("  BELLA ", "bella")).toBe(0);
  });

  it("does not blow up on regex characters in the query", () => {
    expect(() => matchRank("C++ dog", "c++")).not.toThrow();
    expect(matchRank("C++ dog", "c++")).toBeLessThan(99);
  });

  it("returns no match for empty input either way", () => {
    expect(matchRank(null, "bella")).toBe(99);
    expect(matchRank("Bella", "")).toBe(99);
  });
});

describe("rankHits", () => {
  /** The failure this ordering exists to prevent. */
  it("puts the dog called Bella above a client on Bellavista Road", () => {
    const out = rankHits([
      hit({ kind: "client", id: 2, title: "Jo Smith", matchedOn: "12 Bellavista Road" }),
      hit({ kind: "pet", id: 1, title: "Bella" }),
    ], "bella");
    expect(out[0].title).toBe("Bella");
  });

  it("prefers a dog over its owner when both match equally", () => {
    const out = rankHits([
      hit({ kind: "client", id: 2, title: "Max Taylor" }),
      hit({ kind: "pet", id: 1, title: "Max" }),
    ], "max");
    expect(out.map((h) => h.kind)).toEqual(["pet", "client"]);
  });

  it("puts appointments last on a tie, since they are reached through the others", () => {
    const out = rankHits([
      hit({ kind: "appointment", id: 3, title: "Rosie" }),
      hit({ kind: "pet", id: 1, title: "Rosie" }),
      hit({ kind: "client", id: 2, title: "Rosie" }),
    ], "rosie");
    expect(out.map((h) => h.kind)).toEqual(["pet", "client", "appointment"]);
  });

  it("ranks on matchedOn when the title does not match at all", () => {
    const out = rankHits([
      hit({ kind: "client", id: 1, title: "Jo Smith", matchedOn: "0499999999" }),
      hit({ kind: "client", id: 2, title: "Pat Jones", matchedOn: "0412345678" }),
    ], "0412");
    expect(out[0].id).toBe(2);
  });

  it("does not mutate what it was given", () => {
    const input = [hit({ id: 1, title: "B" }), hit({ id: 2, title: "A" })];
    rankHits(input, "a");
    expect(input.map((h) => h.id)).toEqual([1, 2]);
  });
});

describe("phone handling", () => {
  it("strips everything that is not a digit", () => {
    expect(normalisePhone("(04) 1234-5678")).toBe("0412345678");
    expect(normalisePhone("+61 412 345 678")).toBe("61412345678");
  });

  it("treats a short run of digits as a phone search", () => {
    expect(looksLikePhone("0412")).toBe(true);
    expect(looksLikePhone("04 1234 5678")).toBe(true);
    expect(looksLikePhone("+61412345678")).toBe(true);
    expect(looksLikePhone("Bella")).toBe(false);
    expect(looksLikePhone("12")).toBe(false);
  });
});

describe("where an appointment result goes", () => {
  /** A dog mid-groom belongs on the board, not the calendar. */
  it.each(["checked_in", "bathing", "drying", "grooming", "ready"])(
    "sends a dog that is %s to the workflow board", (state) => {
      expect(appointmentHref(state, "2026-11-03")).toBe("/workflow");
      expect(isOnTheFloor(state)).toBe(true);
    },
  );

  it.each(["scheduled", "complete", "cancelled", "no_show"])(
    "sends a %s booking to its day on the calendar", (state) => {
      expect(appointmentHref(state, "2026-11-03")).toBe("/calendar?date=2026-11-03");
      expect(isOnTheFloor(state)).toBe(false);
    },
  );

  it("treats an unknown or missing state as not on the floor", () => {
    expect(appointmentHref(null, "2026-11-03")).toBe("/calendar?date=2026-11-03");
    expect(appointmentHref("something_new", "2026-11-03")).toBe("/calendar?date=2026-11-03");
  });
});

describe("groupLabel", () => {
  it("singularises", () => {
    expect(groupLabel("pet", 1)).toBe("Dog");
    expect(groupLabel("pet", 3)).toBe("Dogs");
    expect(groupLabel("client", 1)).toBe("Client");
    expect(groupLabel("appointment", 2)).toBe("Appointments");
  });
});
