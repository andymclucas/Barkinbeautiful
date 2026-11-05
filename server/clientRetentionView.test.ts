import { describe, expect, it } from "vitest";
import {
  isOverdue, filterRetention, sortRetention, pageRetention,
  RETENTION_PAGE_SIZE, type RetentionRow,
} from "@shared/clientRetentionView";

const NOW = new Date("2026-11-05T00:00:00+10:00");
const row = (over: Partial<RetentionRow> = {}): RetentionRow => ({
  petId: 1, petName: "Ripley", breed: "Pom x", firstName: "Megan", lastName: "Williamson",
  phone: "0411652182", visits: 10, usualGapWeeks: 4, averageSpend: 80, totalSpend: 800,
  lastVisit: "2026-10-01", nextVisit: null, onMembership: false, ...over,
});

describe("isOverdue", () => {
  /** Its OWN median, so a fortnightly bath and a ten-weekly groom are
      both on time at completely different intervals. */
  it("is overdue once the dog's own gap has passed", () => {
    expect(isOverdue(row({ usualGapWeeks: 4, lastVisit: "2026-09-01" }), NOW)).toBe(true);
    expect(isOverdue(row({ usualGapWeeks: 10, lastVisit: "2026-09-01" }), NOW)).toBe(false);
  });

  /** Something booked means the salon has it in hand. */
  it("is never overdue when something is booked", () => {
    expect(isOverdue(row({ lastVisit: "2026-01-01", nextVisit: "2026-12-01" }), NOW)).toBe(false);
  });

  /** Two visits is not a pattern; flagging it invents a rhythm. */
  it("never calls a dog with no established gap overdue", () => {
    expect(isOverdue(row({ usualGapWeeks: null, lastVisit: "2020-01-01" }), NOW)).toBe(false);
    expect(isOverdue(row({ usualGapWeeks: 0, lastVisit: "2020-01-01" }), NOW)).toBe(false);
  });

  it("survives a dog with no last visit or a broken date", () => {
    expect(isOverdue(row({ lastVisit: null }), NOW)).toBe(false);
    expect(isOverdue(row({ lastVisit: "not a date" }), NOW)).toBe(false);
  });
});

describe("filterRetention", () => {
  const rows = [
    row({ petId: 1, petName: "Ripley", nextVisit: null, lastVisit: "2026-09-01" }),
    row({ petId: 2, petName: "Bruno", firstName: "Sam", lastName: "Costa", phone: "0400000000", nextVisit: "2026-12-01" }),
    row({ petId: 3, petName: "Coco", onMembership: true, nextVisit: null, lastVisit: "2026-11-04" }),
  ];

  it("searches the dog, the owner and the phone", () => {
    expect(filterRetention(rows, { search: "ripley" }, NOW).map(r => r.petId)).toEqual([1]);
    expect(filterRetention(rows, { search: "costa" }, NOW).map(r => r.petId)).toEqual([2]);
    // Both share the one number; the search is on the row, not the client.
    expect(filterRetention(rows, { search: "0411652182" }, NOW).map(r => r.petId)).toEqual([1, 3]);
  });

  it("finds the dogs with nothing booked", () => {
    expect(filterRetention(rows, { unbooked: true }, NOW).map(r => r.petId)).toEqual([1, 3]);
  });

  /** The question the report is opened to answer. */
  it("finds the dogs that are overdue", () => {
    expect(filterRetention(rows, { overdue: true }, NOW).map(r => r.petId)).toEqual([1]);
  });

  it("splits members from everyone else", () => {
    expect(filterRetention(rows, { membership: "on" }, NOW).map(r => r.petId)).toEqual([3]);
    expect(filterRetention(rows, { membership: "off" }, NOW).map(r => r.petId)).toEqual([1, 2]);
    expect(filterRetention(rows, { membership: "any" }, NOW)).toHaveLength(3);
  });

  it("combines filters rather than picking one", () => {
    expect(filterRetention(rows, { unbooked: true, membership: "off" }, NOW).map(r => r.petId)).toEqual([1]);
  });

  it("returns everything for an empty filter", () => {
    expect(filterRetention(rows, {}, NOW)).toHaveLength(3);
  });
});

describe("sortRetention", () => {
  const rows = [
    row({ petId: 1, petName: "Bruno", totalSpend: 100, visits: 3, usualGapWeeks: null, averageSpend: null }),
    row({ petId: 2, petName: "Ava", totalSpend: 900, visits: 30, usualGapWeeks: 2, averageSpend: 30 }),
    row({ petId: 3, petName: "Coco", totalSpend: 500, visits: 12, usualGapWeeks: 8, averageSpend: 120 }),
  ];

  it("defaults to the most valuable first", () => {
    expect(sortRetention(rows, "total", true).map(r => r.petId)).toEqual([2, 3, 1]);
  });

  it("sorts both ways", () => {
    expect(sortRetention(rows, "visits", false).map(r => r.petId)).toEqual([1, 3, 2]);
    expect(sortRetention(rows, "visits", true).map(r => r.petId)).toEqual([2, 3, 1]);
  });

  it("sorts by name alphabetically", () => {
    expect(sortRetention(rows, "name", false).map(r => r.petName)).toEqual(["Ava", "Bruno", "Coco"]);
  });

  /**
   * "Unknown" is not "zero". A dog with too little history to have a
   * usual gap must not sort as though its gap were nought weeks, which
   * would park every new dog at the top of an ascending sort.
   */
  it("puts unknowns last whichever way it is sorted", () => {
    expect(sortRetention(rows, "gap", false).map(r => r.petId)).toEqual([2, 3, 1]);
    expect(sortRetention(rows, "gap", true).map(r => r.petId)).toEqual([3, 2, 1]);
    expect(sortRetention(rows, "spend", false)[2].petId).toBe(1);
  });

  it("does not mutate what it was given", () => {
    const original = rows.map(r => r.petId);
    sortRetention(rows, "visits", false);
    expect(rows.map(r => r.petId)).toEqual(original);
  });
});

describe("pageRetention", () => {
  const many = Array.from({ length: 47 }, (_, i) => row({ petId: i + 1 }));

  it("shows twenty at a time", () => {
    expect(RETENTION_PAGE_SIZE).toBe(20);
    const first = pageRetention(many, 1);
    expect(first.rows).toHaveLength(20);
    expect(first.pageCount).toBe(3);
    expect(first.from).toBe(1);
    expect(first.to).toBe(20);
  });

  it("gives the remainder on the last page", () => {
    const last = pageRetention(many, 3);
    expect(last.rows).toHaveLength(7);
    expect(last.from).toBe(41);
    expect(last.to).toBe(47);
  });

  /**
   * A filter that shrinks the list while somebody is on page 7 must not
   * leave them staring at an empty table.
   */
  it("clamps a page number past the end", () => {
    expect(pageRetention(many, 99).page).toBe(3);
    expect(pageRetention(many, 0).page).toBe(1);
    expect(pageRetention(many, -5).page).toBe(1);
  });

  it("copes with nothing matching", () => {
    const empty = pageRetention([], 1);
    expect(empty.rows).toEqual([]);
    expect(empty.pageCount).toBe(1);
    expect(empty.from).toBe(0);
    expect(empty.to).toBe(0);
    expect(empty.matched).toBe(0);
  });
});
