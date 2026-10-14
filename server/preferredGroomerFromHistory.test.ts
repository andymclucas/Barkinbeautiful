import { describe, it, expect } from "vitest";
import {
  describeHistoryVerdict,
  preferredGroomerFromHistory,
} from "@shared/preferredGroomerFromHistory";

const ACTIVE = [2, 3, 7];              // Megs, Charlotte, Stephanie
const NAMES: Record<number, string> = { 2: "Megs", 3: "Charlotte", 7: "Stephanie", 99: "Nathan" };
const nameOf = (id: number) => NAMES[id] ?? `#${id}`;

/** n grooms by one person, oldest first, a week apart. */
const run = (staffIds: number[], activeStaffIds = ACTIVE) =>
  preferredGroomerFromHistory({
    grooms: staffIds.map((staffId, i) => ({
      staffId,
      at: new Date(2026, 0, 1 + i * 7),
    })),
    activeStaffIds,
  });

describe("preferredGroomerFromHistory", () => {
  it("names the groomer a dog clearly belongs to", () => {
    // Minnie is Stephanie 49 times out of 50. That is not a guess.
    const verdict = run(Array(50).fill(7).map((s, i) => (i === 0 ? 2 : s)));
    expect(verdict).toMatchObject({ ok: true, staffId: 7, grooms: 49, total: 50 });
  });

  it("refuses on one or two grooms", () => {
    // A coincidence, not a habit.
    expect(run([3])).toMatchObject({ ok: false, reason: "too_few", total: 1 });
    expect(run([3, 3])).toMatchObject({ ok: false, reason: "too_few", total: 2 });
  });

  it("accepts a clean run of three", () => {
    expect(run([3, 3, 3])).toMatchObject({ ok: true, staffId: 3, share: 1 });
  });

  it("refuses an even split", () => {
    // A dog shared between two groomers has no usual groomer, and picking
    // one of them invents a preference the salon does not have.
    expect(run([3, 2, 3, 2])).toMatchObject({ ok: false, reason: "no_majority" });
  });

  it("refuses a bare majority below the threshold", () => {
    // 3 of 6 is 50%: under the 60% floor.
    expect(run([3, 3, 3, 2, 2, 7])).toMatchObject({ ok: false, reason: "no_majority" });
  });

  it("catches a dog that CHANGED groomer", () => {
    // The case that makes a majority misleading: six with Megs, the last
    // four with Charlotte. Megs still has the majority and is the wrong
    // answer, so the preference is suppressed rather than entrenched.
    const verdict = run([2, 2, 2, 2, 2, 2, 3, 3, 3, 3]);
    expect(verdict).toMatchObject({
      ok: false, reason: "recently_changed", majorityStaffId: 2, latestStaffId: 3,
    });
  });

  it("is not fooled by the order the rows arrive in", () => {
    // The newest groom is found by date, not by position.
    const verdict = preferredGroomerFromHistory({
      grooms: [
        { staffId: 3, at: "2026-03-01" },
        { staffId: 3, at: "2026-01-01" },
        { staffId: 3, at: "2026-02-01" },
      ],
      activeStaffIds: ACTIVE,
    });
    expect(verdict).toMatchObject({ ok: true, staffId: 3 });
  });

  it("drops grooms by somebody who has left, rather than counting them", () => {
    // Nathan has left. His grooms are not evidence about who grooms this
    // dog now, so they do not count toward anybody's share either.
    const verdict = preferredGroomerFromHistory({
      grooms: [
        { staffId: 99, at: "2026-01-01" },
        { staffId: 99, at: "2026-01-08" },
        { staffId: 99, at: "2026-01-15" },
        { staffId: 3, at: "2026-02-01" },
        { staffId: 3, at: "2026-02-08" },
        { staffId: 3, at: "2026-02-15" },
      ],
      activeStaffIds: ACTIVE,
    });
    expect(verdict).toMatchObject({ ok: true, staffId: 3, total: 3, share: 1 });
  });

  it("never names somebody who has left", () => {
    expect(run([99, 99, 99, 99])).toMatchObject({ ok: false, reason: "too_few", total: 0 });
  });

  it("refuses a dog with no history at all", () => {
    expect(run([])).toMatchObject({ ok: false, reason: "too_few", total: 0 });
  });

  it("honours a stricter threshold when asked", () => {
    // Charlotte 3 of 4 is 0.75, and she did the latest one.
    const tidy = [3, 2, 3, 3].map((staffId, i) => ({ staffId, at: new Date(2026, 0, 1 + i * 7) }));

    // Default floor is 0.6, so this is decisive.
    expect(preferredGroomerFromHistory({ grooms: tidy, activeStaffIds: ACTIVE }))
      .toMatchObject({ ok: true, staffId: 3, share: 0.75 });

    // Raise the floor above it and the same history is no longer enough.
    expect(preferredGroomerFromHistory({ grooms: tidy, activeStaffIds: ACTIVE, minimumShare: 0.8 }))
      .toMatchObject({ ok: false, reason: "no_majority", topShare: 0.75 });

    // Raise the groom count above it and it is not enough either.
    expect(preferredGroomerFromHistory({ grooms: tidy, activeStaffIds: ACTIVE, minimumGrooms: 5 }))
      .toMatchObject({ ok: false, reason: "too_few", total: 4 });
  });
});

describe("describeHistoryVerdict", () => {
  it("says who and how sure", () => {
    expect(describeHistoryVerdict(run([3, 3, 3, 2]), nameOf)).toContain("Charlotte");
    expect(describeHistoryVerdict(run([3, 3, 3]), nameOf)).toContain("3 of 3");
  });

  it("says why it refused, in words a person can act on", () => {
    expect(describeHistoryVerdict(run([3]), nameOf)).toContain("only 1 groom");
    expect(describeHistoryVerdict(run([3, 2, 3, 2]), nameOf)).toContain("no clear majority");
    expect(describeHistoryVerdict(run([2, 2, 2, 2, 2, 2, 3, 3, 3, 3]), nameOf))
      .toContain("changed groomer");
  });
});
