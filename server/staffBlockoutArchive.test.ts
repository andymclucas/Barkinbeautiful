import { describe, it, expect } from "vitest";
import { todayDateKey, addDaysToDateKey, blockoutIsPast } from "@shared/staffBlockouts";

/**
 * Why a groomer who came back this morning was still shown as away.
 */

describe("todayDateKey", () => {
  it("gives the salon's date, not the one UTC happens to be on", () => {
    // 20 Oct 2026, 08:00 Brisbane — which is 19 Oct 22:00 UTC. The old
    // code did new Date(y,m,d).toISOString() and got the 19th.
    const at = new Date("2026-10-19T22:00:00.000Z");
    expect(todayDateKey("Australia/Brisbane", at)).toBe("2026-10-20");
    expect(at.toISOString().slice(0, 10)).toBe("2026-10-19"); // the trap
  });

  it("holds just after Brisbane midnight", () => {
    expect(todayDateKey("Australia/Brisbane", new Date("2026-10-19T14:00:01.000Z")))
      .toBe("2026-10-20");
  });

  it("holds just before Brisbane midnight", () => {
    expect(todayDateKey("Australia/Brisbane", new Date("2026-10-19T13:59:59.000Z")))
      .toBe("2026-10-19");
  });
});

describe("addDaysToDateKey", () => {
  it("steps forward and back without touching a timezone", () => {
    expect(addDaysToDateKey("2026-10-20", 1)).toBe("2026-10-21");
    expect(addDaysToDateKey("2026-10-20", -1)).toBe("2026-10-19");
  });

  it("crosses a month and a year end", () => {
    expect(addDaysToDateKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDaysToDateKey("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("blockoutIsPast", () => {
  it("keeps leave that ends today, because they are back tomorrow", () => {
    expect(blockoutIsPast("2026-10-20", "2026-10-20")).toBe(false);
  });

  it("archives leave that ended yesterday", () => {
    // Megs, Mon 19 Oct, still listed on the 20th.
    expect(blockoutIsPast("2026-10-19", "2026-10-20")).toBe(true);
  });

  it("keeps leave that has not started", () => {
    expect(blockoutIsPast("2026-12-01", "2026-10-20")).toBe(false);
  });

  it("compares as text, which sorts correctly for these keys", () => {
    expect(blockoutIsPast("2026-09-30", "2026-10-01")).toBe(true);
    expect(blockoutIsPast("2025-12-31", "2026-01-01")).toBe(true);
  });
});
