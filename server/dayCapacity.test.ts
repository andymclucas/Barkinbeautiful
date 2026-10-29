import { describe, it, expect } from "vitest";
import { dayCapacity, capacityState, describeCapacity, type CapacityStaff } from "../shared/dayCapacity";

/** The real roster on 30/10/2026. Stephanie baths and does not clip. */
const roster: CapacityStaff[] = [
  { id: 3, name: "Charlotte Purcell", dailyClipCapacity: 8, isActive: 1 },
  { id: 2, name: "Megs Graham", dailyClipCapacity: 8, isActive: 1 },
  { id: 5, name: "Brooklyn Cossey", dailyClipCapacity: 6, isActive: 1 },
  { id: 4, name: "Zakaria Romari", dailyClipCapacity: 6, isActive: 1 },
  { id: 6, name: "Ashleigh Knight", dailyClipCapacity: 5, isActive: 1 },
  { id: 7, name: "Stephanie Baldwin", dailyClipCapacity: null, isActive: 1 },
];
const book = (pairs: [number | null, number][]) =>
  pairs.flatMap(([staffId, n]) => Array.from({ length: n }, () => ({ staffId })));

describe("dayCapacity", () => {
  it("adds up the clip capacity of the groomers who clip", () => {
    expect(dayCapacity([], roster).capacity).toBe(33);
  });

  /**
   * Wed 06/01/2027, real: 24 dogs on the board reads busy, but Ashleigh
   * is full at 5 of 5 while Brooklyn and Zakaria have nine free between
   * them. A salon-wide total cannot show that.
   */
  it("finds the room a salon-wide total would hide", () => {
    const day = dayCapacity(book([[3, 7], [2, 7], [6, 5], [5, 2], [4, 1], [7, 2]]), roster);
    expect(day.booked).toBe(22);         // the two baths are not clip work
    expect(day.remaining).toBe(11);
    expect(day.hasRoom).toBe(true);
    expect(day.perGroomer.find((g) => g.name === "Ashleigh Knight")?.remaining).toBe(0);
    expect(day.perGroomer.find((g) => g.name === "Brooklyn Cossey")?.remaining).toBe(4);
  });

  it("does not count a bather's dogs against the groomers", () => {
    const day = dayCapacity(book([[7, 4]]), roster);
    expect(day.booked).toBe(0);
    expect(day.remaining).toBe(33);
  });

  /** Fri 08/01/2027, real: Brooklyn has 7 against a capacity of 6. */
  it("reports an overbooked groomer rather than clamping to full", () => {
    const day = dayCapacity(book([[5, 7]]), roster);
    const brooklyn = day.perGroomer.find((g) => g.name === "Brooklyn Cossey")!;
    expect(brooklyn.booked).toBe(7);
    expect(brooklyn.over).toBe(1);
    expect(brooklyn.remaining).toBe(0);
    expect(day.overbooked.map((g) => g.name)).toEqual(["Brooklyn Cossey"]);
  });

  it("keeps a dog nobody is assigned to out of every groomer's count", () => {
    const day = dayCapacity(book([[null, 3], [3, 1]]), roster);
    expect(day.unassigned).toBe(3);
    expect(day.booked).toBe(1);
  });

  it("drops a groomer who is away that day", () => {
    const day = dayCapacity([], roster, [3]);          // Charlotte on leave
    expect(day.capacity).toBe(25);
    expect(day.perGroomer.some((g) => g.name === "Charlotte Purcell")).toBe(false);
  });

  it("treats a day with nobody rostered as closed, not full", () => {
    const day = dayCapacity([], roster, [2, 3, 4, 5, 6]);
    expect(day.closed).toBe(true);
    expect(day.capacity).toBe(0);
    expect(capacityState(day)).toBe("closed");
  });

  it("ignores an inactive groomer", () => {
    const day = dayCapacity([], [...roster, { id: 9, name: "Gone", dailyClipCapacity: 10, isActive: 0 }]);
    expect(day.capacity).toBe(33);
  });
});

describe("capacityState", () => {
  const state = (pairs: [number | null, number][], away: number[] = []) =>
    capacityState(dayCapacity(book(pairs), roster, away));

  it("is room when a day is genuinely open", () => {
    expect(state([[3, 1]])).toBe("room");
  });

  it("is tight when only a clip or two is left", () => {
    expect(state([[3, 8], [2, 8], [5, 6], [4, 6], [6, 4]])).toBe("tight");   // 1 of 33 free
  });

  it("is full when every groomer is at capacity", () => {
    expect(state([[3, 8], [2, 8], [5, 6], [4, 6], [6, 5]])).toBe("full");
  });

  /**
   * The question the dot answers is "can I put a dog in this day", so a
   * groomer being one over does NOT make an open day look shut. Real
   * case: Wed 18/11/2026, Ashleigh one past her five with fifteen clips
   * free across the rest — that day is bookable.
   */
  it("still reads as room when one groomer is over but the day is not", () => {
    expect(state([[3, 9], [2, 1]])).toBe("room");
  });

  /** Over is for a day that is both out of room AND past somebody's limit. */
  it("is over only once there is no room left anywhere", () => {
    expect(state([[3, 9], [2, 8], [5, 6], [4, 6], [6, 5]])).toBe("over");
  });

  it("is full, not over, when everyone is exactly at capacity", () => {
    expect(state([[3, 8], [2, 8], [5, 6], [4, 6], [6, 5]])).toBe("full");
  });

  it("is closed rather than full when nobody is working", () => {
    expect(state([], [2, 3, 4, 5, 6])).toBe("closed");
  });
});

describe("describeCapacity", () => {
  it("says what the dot means in words", () => {
    const day = dayCapacity(book([[3, 7], [2, 7], [6, 5], [5, 2], [4, 1]]), roster);
    expect(describeCapacity(day)).toBe("22 of 33 clips · 11 free");
  });

  it("names who is over", () => {
    expect(describeCapacity(dayCapacity(book([[5, 7]]), roster))).toContain("Brooklyn Cossey over by 1");
  });

  it("says nobody is rostered rather than quoting zero of zero", () => {
    expect(describeCapacity(dayCapacity([], roster, [2, 3, 4, 5, 6]))).toBe("Nobody rostered");
  });
});
