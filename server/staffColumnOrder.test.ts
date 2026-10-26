import { describe, it, expect } from "vitest";
import {
  defaultStaffOrder, applyStaffOrder, moveStaff,
  serialiseStaffOrder, parseStaffOrder, orderDiffersFromDefault,
} from "../shared/staffColumnOrder";

const TEAM = [
  { id: 1, name: "Megs", role: "groomer" },
  { id: 2, name: "Bailey", role: "bather" },
  { id: 3, name: "Andy", role: "manager" },
  { id: 4, name: "Steph", role: "bather" },
];
const ids = (list: { id: number }[]) => list.map((m) => m.id);

describe("defaultStaffOrder", () => {
  it("puts groomers before bathers, then alphabetical", () => {
    // The order the calendar has always used, kept so that "no
    // preference" means exactly what it did before.
    expect(ids(defaultStaffOrder(TEAM))).toEqual([3, 1, 2, 4]);
  });
});

describe("applyStaffOrder", () => {
  it("uses the saved order", () => {
    expect(ids(applyStaffOrder(TEAM, [4, 1, 3, 2]))).toEqual([4, 1, 3, 2]);
  });

  it("falls back to the default when nothing is saved", () => {
    for (const nothing of [null, undefined, []]) {
      expect(ids(applyStaffOrder(TEAM, nothing))).toEqual([3, 1, 2, 4]);
    }
  });

  it("drops somebody who has left", () => {
    // 99 was on the team in March and is not any more.
    expect(ids(applyStaffOrder(TEAM, [99, 4, 1]))).toEqual([4, 1, 3, 2]);
  });

  it("NEVER loses somebody hired since the order was saved", () => {
    // A groomer missing from the board is a dog nobody can book. New
    // staff land after the ordered ones, in default order.
    const saved = [4, 1];
    const applied = applyStaffOrder(TEAM, saved);
    expect(ids(applied)).toEqual([4, 1, 3, 2]);
    expect(applied).toHaveLength(TEAM.length);
  });

  it("ignores a duplicated id rather than listing someone twice", () => {
    expect(ids(applyStaffOrder(TEAM, [1, 1, 1, 4]))).toEqual([1, 4, 3, 2]);
  });

  it("always returns everyone exactly once, whatever the saved order", () => {
    for (const saved of [[], [1], [4, 3, 2, 1], [99, 98], [2, 2, 3]]) {
      const applied = ids(applyStaffOrder(TEAM, saved));
      expect(new Set(applied).size).toBe(TEAM.length);
      expect(applied.sort()).toEqual([1, 2, 3, 4]);
    }
  });
});

describe("moveStaff", () => {
  const ordered = defaultStaffOrder(TEAM); // [3, 1, 2, 4]

  it("moves one place at a time", () => {
    expect(ids(moveStaff(ordered, 1, "up"))).toEqual([1, 3, 2, 4]);
    expect(ids(moveStaff(ordered, 1, "down"))).toEqual([3, 2, 1, 4]);
  });

  it("does nothing at the ends, rather than wrapping round", () => {
    expect(ids(moveStaff(ordered, 3, "up"))).toEqual([3, 1, 2, 4]);
    expect(ids(moveStaff(ordered, 4, "down"))).toEqual([3, 1, 2, 4]);
  });

  it("does nothing for an id that is not there", () => {
    expect(ids(moveStaff(ordered, 99, "up"))).toEqual([3, 1, 2, 4]);
  });

  it("never mutates the list it was given", () => {
    const before = ids(ordered);
    moveStaff(ordered, 1, "up");
    expect(ids(ordered)).toEqual(before);
  });
});

describe("serialise / parse", () => {
  it("round-trips", () => {
    expect(parseStaffOrder(serialiseStaffOrder([4, 1, 3, 2]))).toEqual([4, 1, 3, 2]);
  });

  it("reads rubbish as no preference instead of throwing", () => {
    for (const bad of [null, undefined, "", "   ", "abc", ",,,", "0", "-3"]) {
      expect(parseStaffOrder(bad)).toEqual([]);
    }
  });

  it("drops duplicates and junk from a part-corrupt value", () => {
    expect(parseStaffOrder("4, 1, abc, 1, 0, 3")).toEqual([4, 1, 3]);
  });

  it("stores as a comma list, not JSON", () => {
    // TiDB has no JSON_TABLE — a query that used it broke every client
    // record on 22/10/2026 — so every read here stays a JS string split.
    expect(serialiseStaffOrder([4, 1, 3])).toBe("4,1,3");
  });
});

describe("orderDiffersFromDefault", () => {
  it("knows when there is nothing worth saving", () => {
    expect(orderDiffersFromDefault(TEAM, null)).toBe(false);
    expect(orderDiffersFromDefault(TEAM, [3, 1, 2, 4])).toBe(false);
    expect(orderDiffersFromDefault(TEAM, [4, 1, 3, 2])).toBe(true);
  });

  it("is false once a saved order has decayed back to the default", () => {
    // Everyone named in it has left, so it no longer says anything.
    expect(orderDiffersFromDefault(TEAM, [98, 99])).toBe(false);
  });
});
