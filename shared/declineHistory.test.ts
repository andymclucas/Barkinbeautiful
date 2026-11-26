import { describe, expect, it } from "vitest";
import { declineHistoryByMembership, describeDeclineHistory, NO_DECLINES } from "./declineHistory";

const TZ = "Australia/Brisbane";

describe("declineHistoryByMembership", () => {
  it("counts every failed row per membership and keeps the first and last", () => {
    const h = declineHistoryByMembership([
      { membershipId: 1, createdAt: "2026-11-20T00:00:00Z" },
      { membershipId: 1, createdAt: "2026-09-03T00:00:00Z" },
      { membershipId: 2, createdAt: new Date("2026-10-01T00:00:00Z") },
      { membershipId: 1, createdAt: "2026-10-15T00:00:00Z" },
    ]);
    expect(h.get(1)?.total).toBe(3);
    expect(h.get(1)?.firstAt?.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(h.get(1)?.lastAt?.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(h.get(2)?.total).toBe(1);
    expect(h.get(3)).toBeUndefined();
  });

  it("still counts a row with no usable date", () => {
    const h = declineHistoryByMembership([{ membershipId: 5, createdAt: null }, { membershipId: 5, createdAt: "nonsense" }]);
    expect(h.get(5)).toEqual({ total: 2, firstAt: null, lastAt: null });
  });
});

describe("describeDeclineHistory", () => {
  const now = new Date("2026-11-26T00:00:00Z");

  it("says nothing for a membership that never declined", () => {
    expect(describeDeclineHistory(NO_DECLINES, TZ, now)).toBeNull();
    expect(describeDeclineHistory(undefined, TZ, now)).toBeNull();
  });

  it("says once, with the day", () => {
    expect(describeDeclineHistory({ total: 1, firstAt: new Date("2026-11-19T23:00:00Z"), lastAt: null }, TZ, now))
      .toBe("Declined once, on 20 Nov");
  });

  it("gives the count and the first day in Brisbane time", () => {
    expect(describeDeclineHistory({ total: 4, firstAt: new Date("2026-09-02T15:00:00Z"), lastAt: null }, TZ, now))
      .toBe("Declined 4 times since 3 Sept");
  });

  it("adds the year when the first decline was last year", () => {
    expect(describeDeclineHistory({ total: 7, firstAt: new Date("2025-08-10T02:00:00Z"), lastAt: null }, TZ, now))
      .toBe("Declined 7 times since 10 Aug 2025");
  });
});
