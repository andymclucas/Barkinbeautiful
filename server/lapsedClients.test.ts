import { describe, it, expect } from "vitest";
import {
  lapsedClients,
  DEFAULT_MIN_VISITS,
  DEFAULT_OVERDUE_FACTOR,
  MIN_PLAUSIBLE_GAP_DAYS,
  type LapsedVisit,
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
