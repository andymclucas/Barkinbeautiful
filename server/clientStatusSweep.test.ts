import { describe, it, expect } from "vitest";
import { MAX_SHARE_OF_ACTIVE, planSweep, describeSweep, type SweepRow } from "./clientStatusSweep";

/**
 * The nightly pass, as a plan.
 *
 * Andy, 09/11/2026: "The rule should be in place that if zero appts in
 * the last 12 months (or any upcoming), the client goes into Inactive
 * status." And, told the catch-up was 89.6% of the book and what it
 * costs: "Raise the ceiling and run the catch-up."
 */
const NOW = new Date("2026-11-09T12:00:00+10:00");
const row = (over: Partial<SweepRow> & { id: number }): SweepRow => ({
  tenantId: 1, name: `client ${over.id}`, status: "active",
  lastVisitDay: null, hasFutureBooking: false, hasLiveMembership: false,
  ...over,
});

describe("planSweep", () => {
  it("works the cutoff out from the day, not the hour it runs", () => {
    expect(planSweep([], NOW).cutoffDay).toBe("2025-11-09");
    expect(planSweep([], new Date("2026-11-09T23:59:00+10:00")).cutoffDay).toBe("2025-11-09");
  });

  it("marks a client who has not been in and has nothing booked", () => {
    const plan = planSweep([row({ id: 1, lastVisitDay: "2024-03-01" })], NOW);
    expect(plan.toDeactivate.map((r) => r.id)).toEqual([1]);
  });

  /* Andy's "(or any upcoming)". A client who has not been in for two
     years but is in the diary on Friday is not gone. */
  it("leaves anyone with something booked alone", () => {
    const plan = planSweep(
      [row({ id: 1, lastVisitDay: "2024-03-01", hasFutureBooking: true })], NOW);
    expect(plan.toDeactivate).toHaveLength(0);
    expect(plan.deactivateSkips.has_future_booking).toBe(1);
  });

  it("never marks a paying member", () => {
    const plan = planSweep(
      [row({ id: 1, lastVisitDay: "2023-01-01", hasLiveMembership: true })], NOW);
    expect(plan.toDeactivate).toHaveLength(0);
    expect(plan.deactivateSkips.has_live_membership).toBe(1);
  });

  it("brings an inactive client back once they are booked in", () => {
    const plan = planSweep(
      [row({ id: 1, status: "inactive", hasFutureBooking: true })], NOW);
    expect(plan.toReactivate.map((r) => r.id)).toEqual([1]);
    expect(plan.toDeactivate).toHaveLength(0);
  });

  /* The two halves acting on one client would flip them nightly. */
  it("never puts the same client in both lists", () => {
    const rows = [
      row({ id: 1, status: "active", lastVisitDay: "2024-01-01" }),
      row({ id: 2, status: "inactive", hasFutureBooking: true }),
      row({ id: 3, status: "active", lastVisitDay: "2026-10-01" }),
      row({ id: 4, status: "blocked", hasFutureBooking: true }),
    ];
    const plan = planSweep(rows, NOW);
    const down = new Set(plan.toDeactivate.map((r) => r.id));
    for (const r of plan.toReactivate) expect(down.has(r.id)).toBe(false);
    // And blocked is in neither.
    expect(down.has(4)).toBe(false);
    expect(plan.toReactivate.map((r) => r.id)).not.toContain(4);
  });

  describe("the blast-radius ceiling", () => {
    // 10 active clients, 9 of them long gone.
    const book = [
      ...Array.from({ length: 9 }, (_, i) => row({ id: i + 1, lastVisitDay: "2024-01-01" })),
      row({ id: 10, lastVisitDay: "2026-10-01" }),
    ];

    it("refuses a run that would restatus most of the book", () => {
      const plan = planSweep(book, NOW);
      expect(plan.toDeactivate).toHaveLength(9);
      expect(plan.refusedReason).toContain("ceiling");
      expect(MAX_SHARE_OF_ACTIVE).toBe(0.5);
    });

    it("lets it through when the exact number is acknowledged", () => {
      expect(planSweep(book, NOW, { acknowledgedDeactivations: 9 }).refusedReason).toBeNull();
    });

    /*
     * Exact, not "at least". The number is the authorisation, and a plan
     * that has grown since it was read is a different plan — which is
     * what stops the same command being re-run next week against a book
     * that has moved.
     */
    it("still refuses when the number does not match the plan", () => {
      for (const n of [8, 10, 0]) {
        const plan = planSweep(book, NOW, { acknowledgedDeactivations: n });
        expect(plan.refusedReason, String(n)).not.toBeNull();
        expect(plan.refusedReason).toContain(`acknowledged ${n}, plan is 9`);
      }
    });

    it("needs no acknowledgement under the ceiling", () => {
      const plan = planSweep([
        row({ id: 1, lastVisitDay: "2024-01-01" }),
        ...Array.from({ length: 9 }, (_, i) => row({ id: i + 2, lastVisitDay: "2026-10-01" })),
      ], NOW);
      expect(plan.toDeactivate).toHaveLength(1);
      expect(plan.refusedReason).toBeNull();
    });

    it("does not count reactivations towards the ceiling", () => {
      // Bringing people back is not a blast radius worth bounding: it
      // only ever happens to someone with a booking in the diary.
      const plan = planSweep(
        Array.from({ length: 20 }, (_, i) =>
          row({ id: i + 1, status: "inactive", hasFutureBooking: true })), NOW);
      expect(plan.toReactivate).toHaveLength(20);
      expect(plan.refusedReason).toBeNull();
    });
  });

  it("says what it would do, in words", () => {
    const lines = describeSweep(planSweep([
      row({ id: 1, lastVisitDay: "2024-01-01" }),
      row({ id: 2, lastVisitDay: "2026-10-01" }),
    ], NOW));
    expect(lines.join("\n")).toContain("to mark inactive: 1");
    expect(lines.join("\n")).toContain("visited inside the window");
  });
});
