import { describe, it, expect } from "vitest";
import {
  lapsedClients,
  sortLapsedRows,
  LAPSED_SORT_KEYS,
  LAPSED_SORT_DEFAULT_DIR,
  DEFAULT_MIN_VISITS,
  DEFAULT_OVERDUE_FACTOR,
  MIN_PLAUSIBLE_GAP_DAYS,
  type LapsedVisit,
  type LapsedSortable,
} from "@shared/lapsedClients";

const TZ = "Australia/Brisbane";
const NOW = new Date("2026-11-05T02:00:00Z"); // midday Brisbane

const visit = (clientId: number, date: string, price: string | null = "120.00"): LapsedVisit => ({
  clientId,
  scheduledStart: new Date(`${date}T23:00:00Z`), // 9am Brisbane next day
  price,
});

/** A client on a steady `gapDays` rhythm, last seen `lastDaysAgo` ago. */
function rhythm(clientId: number, trips: number, gapDays: number, lastDaysAgo: number, price: string | null = "120.00") {
  const out: LapsedVisit[] = [];
  for (let i = 0; i < trips; i += 1) {
    const daysAgo = lastDaysAgo + (trips - 1 - i) * gapDays;
    const at = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    out.push({ clientId, scheduledStart: at, price });
  }
  return out;
}

const opts = (over: Partial<Parameters<typeof lapsedClients>[1]> = {}) => ({
  now: NOW,
  timeZone: TZ,
  ...over,
});

describe("lapsedClients", () => {
  it("finds a client who is well past their own rhythm", () => {
    const rows = lapsedClients(rhythm(1, 5, 42, 120), opts());
    expect(rows).toHaveLength(1);
    expect(rows[0].clientId).toBe(1);
    expect(rows[0].usualGapDays).toBeCloseTo(42);
    expect(rows[0].daysSince).toBeCloseTo(120);
    expect(rows[0].overdueFactor).toBeCloseTo(120 / 42);
  });

  it("leaves alone a client who is merely due", () => {
    // 45 days into a 42-day rhythm is late, not gone.
    expect(lapsedClients(rhythm(1, 5, 42, 45), opts())).toEqual([]);
  });

  it("measures lateness against each client's OWN gap, not a salon figure", () => {
    const rows = lapsedClients(
      [...rhythm(1, 5, 14, 60), ...rhythm(2, 5, 70, 60)],
      opts(),
    );
    // 60 days is four gaps for the fortnightly dog and under one for the
    // ten-weekly one. A single salon-wide threshold cannot do this.
    expect(rows.map((r) => r.clientId)).toEqual([1]);
  });

  it("never lapses a client with something in the diary", () => {
    const visits = rhythm(1, 5, 42, 300);
    expect(lapsedClients(visits, opts())).toHaveLength(1);
    expect(lapsedClients(visits, opts({ bookedClientIds: new Set([1]) }))).toEqual([]);
  });

  it("will not invent a rhythm for a client with too little history", () => {
    expect(lapsedClients(rhythm(1, 2, 42, 300), opts())).toEqual([]);
    expect(lapsedClients(rhythm(1, 3, 42, 300), opts())).toHaveLength(1);
    expect(DEFAULT_MIN_VISITS).toBe(3);
  });

  it("counts one trip when a household brings two dogs on the same day", () => {
    // Four trips, two dogs each. As appointments the gaps alternate
    // between 0 and 42 days and the median collapses towards zero, which
    // would call a punctual household lapsed the day after a visit.
    const twoDogs: LapsedVisit[] = [];
    for (let i = 0; i < 4; i += 1) {
      const daysAgo = 50 + (3 - i) * 42;
      const at = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      twoDogs.push({ clientId: 1, scheduledStart: at, price: "100.00" });
      twoDogs.push({ clientId: 1, scheduledStart: new Date(at.getTime() + 60 * 60 * 1000), price: "80.00" });
    }
    const rows = lapsedClients(twoDogs, opts({ minOverdueFactor: 1 }));
    expect(rows[0].visits).toBe(4);
    expect(rows[0].usualGapDays).toBeCloseTo(42);
    // Both dogs still count towards what the trip was worth.
    expect(rows[0].averageSpend).toBeCloseTo(180);
  });

  it("leaves unpriced grooms out of the average rather than calling them free", () => {
    const visits = [
      ...rhythm(1, 2, 42, 180, null),
      ...rhythm(1, 2, 42, 96, "200.00"),
    ];
    const rows = lapsedClients(visits, opts());
    // Two priced trips at 200, not four trips averaging 100.
    expect(rows[0].averageSpend).toBeCloseTo(200);
  });

  it("reports no lost revenue when nothing was ever priced", () => {
    const rows = lapsedClients(rhythm(1, 5, 42, 300, null), opts());
    expect(rows[0].averageSpend).toBeNull();
    expect(rows[0].estimatedLostRevenue).toBe(0);
  });

  it("counts only whole missed trips, so it never invents a booking", () => {
    // 2.9 gaps away: they have certainly missed one, not 1.9.
    const rows = lapsedClients(rhythm(1, 5, 40, 116), opts());
    expect(rows[0].overdueFactor).toBeCloseTo(2.9);
    expect(rows[0].missedVisits).toBe(1);
    expect(rows[0].estimatedLostRevenue).toBeCloseTo(120);
  });

  it("ignores a visit dated in the future", () => {
    const visits = [
      ...rhythm(1, 4, 42, 200),
      { clientId: 1, scheduledStart: new Date(NOW.getTime() + 86_400_000), price: "120.00" },
    ];
    // The future row becomes the last visit, so daysSince is negative and
    // the client is not lapsed — a booking ahead is the booked case.
    expect(lapsedClients(visits, opts())).toEqual([]);
  });

  it("skips junk dates and prices rather than throwing", () => {
    const rows = lapsedClients(
      [
        ...rhythm(1, 4, 42, 300),
        { clientId: 1, scheduledStart: "not a date", price: "oops" },
      ],
      opts(),
    );
    expect(rows).toHaveLength(1);
    expect(Number.isFinite(rows[0].estimatedLostRevenue)).toBe(true);
  });

  it("does not mistake a run of consecutive days for a daily rhythm", () => {
    // Four grooms on four consecutive days and nothing since. The first
    // version read that as a one-day cadence, four hundred days overdue,
    // and put five figures of imagined lost revenue at the top of the
    // report. It is a booking being corrected, not a dog groomed daily.
    const consecutive = [0, 1, 2, 3].map((offset) => ({
      clientId: 1,
      scheduledStart: new Date(NOW.getTime() - (413 - offset) * 24 * 60 * 60 * 1000),
      price: "60.00",
    }));
    expect(lapsedClients(consecutive, opts())).toEqual([]);
  });

  it("keeps a real rhythm that happens to contain one correction", () => {
    // Five six-weekly trips, one of them re-done the next day. The redo
    // must not drag the median down; the client is still six-weekly.
    const visits = [
      ...rhythm(1, 5, 42, 200),
      { clientId: 1, scheduledStart: new Date(NOW.getTime() - 199 * 24 * 60 * 60 * 1000), price: "60.00" },
    ];
    const rows = lapsedClients(visits, opts());
    expect(rows).toHaveLength(1);
    expect(rows[0].usualGapDays).toBeCloseTo(42);
  });

  it("drops a client whose every gap is implausible", () => {
    // Trips three days apart are not a grooming interval at any count.
    expect(lapsedClients(rhythm(1, 8, 3, 400), opts())).toEqual([]);
  });

  it("pins the plausible floor at a week", () => {
    expect(MIN_PLAUSIBLE_GAP_DAYS).toBe(7);
  });

  it("pins the threshold at twice their own gap", () => {
    expect(DEFAULT_OVERDUE_FACTOR).toBe(2);
  });
});

/** A row with every field the comparator reads, overridable per test. */
function row(over: Partial<LapsedSortable> & { clientId: number }): LapsedSortable {
  return {
    visits: 4,
    usualGapDays: 28,
    lastVisit: new Date("2026-01-01T00:00:00Z"),
    daysSince: 100,
    missedVisits: 2,
    estimatedLostRevenue: 500,
    totalSpend: 1000,
    onMembership: false,
    firstName: "A",
    lastName: "Aaa",
    ...over,
  };
}

const ids = (rows: readonly LapsedSortable[]) => rows.map((r) => r.clientId);

describe("sorting the lapsed report", () => {
  it("defaults to the ranking the report had before it was sortable", () => {
    const rows = [
      row({ clientId: 1, estimatedLostRevenue: 100 }),
      row({ clientId: 2, estimatedLostRevenue: 3240 }),
      row({ clientId: 3, estimatedLostRevenue: 2670 }),
    ];
    expect(ids(sortLapsedRows(rows, "notTaken", "desc"))).toEqual([2, 3, 1]);
  });

  it("keeps a paying member first under EVERY column, both ways", () => {
    // The subtitle promises they come first "whatever the spend says".
    // That has to survive the sort, or the promise only holds on the
    // default column — which is the one place nobody needed telling.
    const member = row({ clientId: 99, onMembership: true, estimatedLostRevenue: 0, visits: 1, daysSince: 1, missedVisits: 0, lastVisit: new Date("2026-08-04T00:00:00Z"), usualGapDays: 56, lastName: "Zzz", totalSpend: 0 });
    const big = row({ clientId: 1, estimatedLostRevenue: 9999, visits: 40, daysSince: 999, missedVisits: 40, lastVisit: new Date("2025-01-01T00:00:00Z"), usualGapDays: 7, lastName: "Aaa", totalSpend: 9999 });
    for (const key of LAPSED_SORT_KEYS) {
      for (const dir of ["asc", "desc"] as const) {
        expect(ids(sortLapsedRows([big, member], key, dir))[0], `${key}/${dir}`).toBe(99);
      }
    }
  });

  it("sorts by each column in the direction asked for", () => {
    const a = row({ clientId: 1, visits: 3, usualGapDays: 14, daysSince: 200, missedVisits: 1, estimatedLostRevenue: 100, lastVisit: new Date("2025-06-01T00:00:00Z"), lastName: "Bbb" });
    const b = row({ clientId: 2, visits: 20, usualGapDays: 7, daysSince: 50, missedVisits: 9, estimatedLostRevenue: 900, lastVisit: new Date("2026-05-01T00:00:00Z"), lastName: "Aaa" });
    const cases: [typeof LAPSED_SORT_KEYS[number], number[]][] = [
      ["name", [2, 1]],        // Aaa before Bbb
      ["visits", [1, 2]],      // 3 before 20
      ["usualGap", [2, 1]],    // 7 before 14
      ["lastSeen", [1, 2]],    // 2025 before 2026
      ["away", [2, 1]],        // 50 before 200
      ["missed", [1, 2]],      // 1 before 9
      ["notTaken", [1, 2]],    // 100 before 900
    ];
    for (const [key, expected] of cases) {
      expect(ids(sortLapsedRows([a, b], key, "asc")), key).toEqual(expected);
      expect(ids(sortLapsedRows([a, b], key, "desc")), key).toEqual([...expected].reverse());
    }
  });

  it("opens each column at its useful end", () => {
    // Nobody wants the fewest missed visits first, and nobody wants the
    // most recent visit first on a report about people who stopped coming.
    expect(LAPSED_SORT_DEFAULT_DIR.name).toBe("asc");
    expect(LAPSED_SORT_DEFAULT_DIR.lastSeen).toBe("asc");
    expect(LAPSED_SORT_DEFAULT_DIR.away).toBe("desc");
    expect(LAPSED_SORT_DEFAULT_DIR.missed).toBe("desc");
    expect(LAPSED_SORT_DEFAULT_DIR.notTaken).toBe("desc");
    // Every key has one, so a new column cannot open undefined.
    for (const key of LAPSED_SORT_KEYS) {
      expect(LAPSED_SORT_DEFAULT_DIR[key], key).toMatch(/^(asc|desc)$/);
    }
  });

  it("never swaps two identical clients between renders", () => {
    // The salon's own book has two of these to the dollar: same household,
    // same figures, adjacent rows. Without a final tiebreak they can
    // change places on a re-sort for no reason the reader can see.
    const twins = [
      row({ clientId: 71, estimatedLostRevenue: 2100, totalSpend: 2100, lastName: "Cameron", firstName: "Tahlia" }),
      row({ clientId: 70, estimatedLostRevenue: 2100, totalSpend: 2100, lastName: "Cameron", firstName: "Dean" }),
    ];
    expect(ids(sortLapsedRows(twins, "notTaken", "desc"))).toEqual([70, 71]);
    expect(ids(sortLapsedRows([...twins].reverse(), "notTaken", "desc"))).toEqual([70, 71]);
  });

  it("breaks a tie on the default column by lifetime spend, and only there", () => {
    const poorer = row({ clientId: 1, estimatedLostRevenue: 500, totalSpend: 100, lastName: "Aaa" });
    const richer = row({ clientId: 2, estimatedLostRevenue: 500, totalSpend: 9000, lastName: "Bbb" });
    // Two clients owed the same money are not equally worth ringing.
    expect(ids(sortLapsedRows([poorer, richer], "notTaken", "desc"))).toEqual([2, 1]);
    // But ranking by spend inside a name sort would be surprising.
    expect(ids(sortLapsedRows([richer, poorer], "name", "asc"))).toEqual([1, 2]);
  });

  it("leaves the array it was given alone", () => {
    const rows = [row({ clientId: 1, estimatedLostRevenue: 1 }), row({ clientId: 2, estimatedLostRevenue: 2 })];
    const before = ids(rows);
    sortLapsedRows(rows, "notTaken", "desc");
    expect(ids(rows)).toEqual(before);
  });

  it("handles a missing name without throwing", () => {
    const rows = [row({ clientId: 1, firstName: null, lastName: null }), row({ clientId: 2, lastName: "Bbb" })];
    expect(() => sortLapsedRows(rows, "name", "asc")).not.toThrow();
    expect(ids(sortLapsedRows(rows, "name", "asc"))).toEqual([1, 2]);
  });
});
