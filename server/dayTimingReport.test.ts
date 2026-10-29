import { describe, it, expect } from "vitest";
import {
  dogDayTiming, dayTimingSummary, byLongestWait, byArrival,
  stageMinutes, formatMinutes, DAY_TIMING_STAGES, DAY_TIMING_STAGE_STATE,
  type DayTimingInput,
} from "../shared/dayTimingReport";
import { WORKFLOW_STAGE_COLOURS, UNKNOWN_STAGE_COLOUR, stageColour } from "../shared/workflowStageColours";

/** Brisbane wall-clock on 29/10/2026 as epoch ms. No DST to worry about. */
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Date.UTC(2026, 9, 29, h - 10, m);
};

const row = (over: Partial<DayTimingInput> = {}): DayTimingInput => ({
  appointmentId: 1, petName: "Frankie", clientName: "A Client",
  groomerName: "Megs Graham", serviceType: "classic_groom",
  workflowState: "complete",
  checkedInAt: at("07:28"), bathingStartedAt: at("07:43"), bathingCompletedAt: at("08:14"),
  dryingStartedAt: at("08:14"), dryingCompletedAt: at("08:30"),
  groomingStartedAt: at("08:30"), groomingCompletedAt: at("09:28"),
  readyAt: at("10:29"), completedAt: at("10:45"),
  ...over,
});

describe("stageMinutes", () => {
  it("is the gap in whole minutes", () => {
    expect(stageMinutes(at("07:28"), at("07:43"))).toBe(15);
  });

  /** A stage that never happened is not a zero-length stage. */
  it("is null when either end is missing", () => {
    expect(stageMinutes(null, at("08:00"))).toBeNull();
    expect(stageMinutes(at("08:00"), null)).toBeNull();
    expect(stageMinutes(undefined, undefined)).toBeNull();
  });

  it("refuses a backwards or zero-length pair rather than returning negative time", () => {
    expect(stageMinutes(at("09:00"), at("08:00"))).toBeNull();
    expect(stageMinutes(at("09:00"), at("09:00"))).toBeNull();
  });
});

describe("dogDayTiming", () => {
  it("breaks the day into waits and work, in order", () => {
    const d = dogDayTiming(row());
    expect(d.stages.map(s => s.key)).toEqual([
      "waitBath", "bathing", "waitDry", "drying", "waitGroom", "grooming", "waitPickup",
    ]);
    expect(d.stages.find(s => s.key === "waitBath")?.minutes).toBe(15);
    expect(d.stages.find(s => s.key === "bathing")?.minutes).toBe(31);
    expect(d.stages.find(s => s.key === "grooming")?.minutes).toBe(58);
  });

  /**
   * Radley, 29/10/2026: checked in 09:23, bath started 11:53. The bath
   * itself was inside every configured threshold; the 150-minute wait
   * in front of it is what nothing measured.
   */
  it("surfaces the wait Lauren asked about", () => {
    const d = dogDayTiming(row({
      petName: "Radley", checkedInAt: at("09:23"), bathingStartedAt: at("11:53"),
    }));
    expect(d.waitForBathMinutes).toBe(150);
  });

  it("adds up every gap, not just the first one", () => {
    const d = dogDayTiming(row({
      checkedInAt: at("08:00"), bathingStartedAt: at("09:00"), bathingCompletedAt: at("09:20"),
      dryingStartedAt: at("09:50"), dryingCompletedAt: at("10:10"),
      groomingStartedAt: at("10:40"), groomingCompletedAt: at("11:30"),
      readyAt: at("11:30"), completedAt: at("11:45"),
    }));
    expect(d.waitForBathMinutes).toBe(60);
    expect(d.totalWaitMinutes).toBe(60 + 30 + 30 + 15);
  });

  it("gives a bath-only dog no grooming stage rather than a zero one", () => {
    const d = dogDayTiming(row({
      serviceType: "bath_only", groomingStartedAt: null, groomingCompletedAt: null,
    }));
    expect(d.stages.find(s => s.key === "grooming")?.minutes).toBeNull();
    expect(d.waitForBathMinutes).toBe(15);
  });

  /** Lola and Ollie were still checked_in at 12:16 with nothing after it. */
  it("leaves a dog still on the floor without a total", () => {
    const d = dogDayTiming(row({
      petName: "Lola", workflowState: "checked_in", checkedInAt: at("12:16"),
      bathingStartedAt: null, bathingCompletedAt: null, dryingStartedAt: null,
      dryingCompletedAt: null, groomingStartedAt: null, groomingCompletedAt: null,
      readyAt: null, completedAt: null,
    }));
    expect(d.finished).toBe(false);
    expect(d.totalMinutes).toBeNull();
    expect(d.waitForBathMinutes).toBeNull();
    expect(d.totalWaitMinutes).toBeNull();
  });

  it("falls back to a readable name rather than rendering nothing", () => {
    expect(dogDayTiming(row({ petName: null })).petName).toBe("Unnamed dog");
    expect(dogDayTiming(row({ petName: "  " })).petName).toBe("Unnamed dog");
  });
});

describe("dayTimingSummary", () => {
  /** The real shape of 29/10/2026: a calm start, then a pile-up. */
  const day = [
    ["Frankie", "07:28", "07:43"], ["Nala", "07:29", "07:39"], ["Remi", "07:30", "07:43"],
    ["Sydney", "07:37", "08:18"], ["Bella", "07:57", "10:13"], ["Tilly", "07:57", "10:13"],
    ["Radley", "09:23", "11:53"],
  ].map(([petName, inAt, bath], i) =>
    dogDayTiming(row({ appointmentId: i + 1, petName, checkedInAt: at(inAt), bathingStartedAt: at(bath) })));

  it("reports the middle and the worst of the day", () => {
    const s = dayTimingSummary(day);
    expect(s.dogs).toBe(7);
    expect(s.measured).toBe(7);
    expect(s.longestWaitMinutes).toBe(150);
    expect(s.longestWaitPet).toBe("Radley");
    // waits: 15, 10, 13, 41, 136, 136, 150 -> sorted 10,13,15,41,136,136,150
    expect(s.medianWaitMinutes).toBe(41);
  });

  it("averages the two middle values for an even count", () => {
    const s = dayTimingSummary(day.slice(0, 4)); // 15, 10, 13, 41 -> 10,13,15,41
    expect(s.medianWaitMinutes).toBe(14);
  });

  it("counts only the dogs it could actually measure", () => {
    const withUnmeasured = [...day, dogDayTiming(row({ petName: "Lola", bathingStartedAt: null }))];
    const s = dayTimingSummary(withUnmeasured);
    expect(s.dogs).toBe(8);
    expect(s.measured).toBe(7);
  });

  it("says nothing rather than zero for a day with no data", () => {
    const s = dayTimingSummary([]);
    expect(s.medianWaitMinutes).toBeNull();
    expect(s.longestWaitMinutes).toBeNull();
    expect(s.longestWaitPet).toBeNull();
  });
});

describe("ordering", () => {
  const dogs = [
    dogDayTiming(row({ petName: "Frankie", checkedInAt: at("07:28"), bathingStartedAt: at("07:43") })),
    dogDayTiming(row({ petName: "Radley", checkedInAt: at("09:23"), bathingStartedAt: at("11:53") })),
    dogDayTiming(row({ petName: "Lola", checkedInAt: at("12:16"), bathingStartedAt: null })),
  ];

  it("puts the worst wait first", () => {
    expect(byLongestWait(dogs).map(d => d.petName)).toEqual(["Radley", "Frankie", "Lola"]);
  });

  it("keeps an unmeasurable dog last rather than treating it as a zero wait", () => {
    expect(byLongestWait(dogs).at(-1)?.petName).toBe("Lola");
  });

  it("can replay the day in arrival order", () => {
    expect(byArrival(dogs).map(d => d.petName)).toEqual(["Frankie", "Radley", "Lola"]);
  });
});

describe("formatMinutes", () => {
  it("reads as a person would say it", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(41)).toBe("41m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(150)).toBe("2h 30m");
    expect(formatMinutes(null)).toBe("—");
  });
});

describe("the stage list", () => {
  /**
   * Delegation check: every stage must name two real columns. A typo
   * here would silently produce a stage that is always null.
   */
  it("names columns that exist on the input", () => {
    const sample = row();
    for (const def of DAY_TIMING_STAGES) {
      expect(Object.hasOwn(sample, def.from), `${def.key}.from`).toBe(true);
      expect(Object.hasOwn(sample, def.to), `${def.key}.to`).toBe(true);
    }
    expect(DAY_TIMING_STAGES).toHaveLength(7);
    expect(DAY_TIMING_STAGES.filter(s => s.isWait)).toHaveLength(4);
  });
});

describe("stage colours", () => {
  /**
   * Delegation check: every stage must resolve to a REAL workflow state,
   * or stageColour() silently hands back the unknown-slate and the bar
   * becomes seven identical grey blocks.
   */
  it("maps every stage onto a state the colour table knows", () => {
    const keys = DAY_TIMING_STAGES.map(s => s.key);
    expect(Object.keys(DAY_TIMING_STAGE_STATE).sort()).toEqual([...keys].sort());

    for (const key of keys) {
      const state = DAY_TIMING_STAGE_STATE[key];
      expect(Object.hasOwn(WORKFLOW_STAGE_COLOURS, state), `${key} -> ${state}`).toBe(true);
      expect(stageColour(state), `${key} fell through to unknown`).not.toBe(UNKNOWN_STAGE_COLOUR);
    }
  });

  it("gives the waits and the work different colours", () => {
    // If a wait shared its stage's hue the bar could not show a pile-up.
    expect(DAY_TIMING_STAGE_STATE.waitDry).not.toBe(DAY_TIMING_STAGE_STATE.drying);
    expect(DAY_TIMING_STAGE_STATE.waitGroom).not.toBe(DAY_TIMING_STAGE_STATE.grooming);
  });
});
