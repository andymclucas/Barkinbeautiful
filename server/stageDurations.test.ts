import { describe, it, expect } from "vitest";
import {
  stageDurations,
  totalWaitMinutes,
  totalActiveMinutes,
  longestWait,
  isWaitingStage,
  stageLabel,
} from "../shared/stageDurations";

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 30, 0, 0, 0);
/** Build transitions from [stage, minutesAfterT0] pairs. */
const at = (pairs: Array<[string, number]>) =>
  pairs.map(([toState, m]) => ({ toState, changedAtMs: T0 + m * MIN }));

// A dog that went straight through, with a long stall before drying.
const A_REAL_DAY = at([
  ["checked_in", 0],
  ["waiting_for_bath", 5],
  ["bathing", 20],
  ["waiting_for_dry", 50],
  ["drying", 95], // 45 minutes stalled - the case this exists for
  ["grooming", 115],
  ["ready", 160],
  ["complete", 175],
]);

describe("stageDurations", () => {
  it("measures every stage, including the waits", () => {
    const d = stageDurations(A_REAL_DAY, T0 + 200 * MIN, { includeOngoing: false });
    expect(d.map((x) => [x.stage, x.minutes])).toEqual([
      ["checked_in", 5],
      ["waiting_for_bath", 15],
      ["bathing", 30],
      ["waiting_for_dry", 45],
      ["drying", 20],
      ["grooming", 45],
      ["ready", 15],
    ]);
  });

  it("surfaces the 45-minute stall as a wait, not as work", () => {
    const d = stageDurations(A_REAL_DAY, T0 + 200 * MIN, { includeOngoing: false });
    const stall = d.find((x) => x.stage === "waiting_for_dry")!;
    expect(stall).toMatchObject({ minutes: 45, isWaiting: true });
    expect(longestWait(d)).toMatchObject({ stage: "waiting_for_dry", minutes: 45 });
  });

  it("splits the day into waiting and working", () => {
    const d = stageDurations(A_REAL_DAY, T0 + 200 * MIN, { includeOngoing: false });
    // waits: for_bath 15 + for_dry 45 + ready 15 = 75; work: checked_in 5 +
    // bathing 30 + drying 20 + grooming 45 = 100
    expect(totalWaitMinutes(d)).toBe(75);
    expect(totalActiveMinutes(d)).toBe(100);
  });

  it("keeps the clock running on a dog still in a stage", () => {
    const live = at([["checked_in", 0], ["waiting_for_bath", 10]]);
    const d = stageDurations(live, T0 + 40 * MIN);
    expect(d[d.length - 1]).toMatchObject({ stage: "waiting_for_bath", minutes: 30, ongoing: true });
  });

  it("can drop the ongoing stage when only completed time is wanted", () => {
    const live = at([["checked_in", 0], ["waiting_for_bath", 10]]);
    expect(stageDurations(live, T0 + 40 * MIN, { includeOngoing: false })).toHaveLength(1);
  });

  it("sorts out-of-order rows rather than reporting negative time", () => {
    const jumbled = at([["bathing", 20], ["checked_in", 0], ["waiting_for_bath", 5]]);
    const d = stageDurations(jumbled, T0 + 30 * MIN);
    expect(d.map((x) => x.stage)).toEqual(["checked_in", "waiting_for_bath", "bathing"]);
    expect(d.every((x) => x.minutes >= 0)).toBe(true);
  });

  it("handles a dog with no history, and a single transition", () => {
    expect(stageDurations([], T0)).toEqual([]);
    expect(stageDurations(at([["checked_in", 0]]), T0 + 12 * MIN)).toEqual([
      { stage: "checked_in", minutes: 12, isWaiting: false, ongoing: true },
    ]);
  });

  it("ignores rows with an unusable timestamp instead of producing NaN", () => {
    const withJunk = [...at([["checked_in", 0]]), { toState: "bathing", changedAtMs: NaN }];
    const d = stageDurations(withJunk, T0 + 10 * MIN);
    expect(d.every((x) => Number.isFinite(x.minutes))).toBe(true);
  });
});

describe("isWaitingStage", () => {
  it("counts the three waits and collection, not the working stages", () => {
    for (const s of ["waiting_for_bath", "waiting_for_dry", "waiting_for_groom", "ready"]) {
      expect(isWaitingStage(s)).toBe(true);
    }
    for (const s of ["bathing", "drying", "grooming", "checked_in", "complete"]) {
      expect(isWaitingStage(s)).toBe(false);
    }
  });
});

describe("longestWait", () => {
  it("returns null when nothing was waited on", () => {
    const d = stageDurations(at([["checked_in", 0], ["bathing", 5], ["complete", 40]]), T0 + 40 * MIN, { includeOngoing: false });
    expect(longestWait(d)).toBeNull();
  });
});

describe("stageLabel", () => {
  it("reads as English", () => {
    expect(stageLabel("waiting_for_dry")).toBe("Waiting for dry");
    expect(stageLabel("bathing")).toBe("Bathing");
    expect(stageLabel("checked_in")).toBe("Checked in");
  });
});
