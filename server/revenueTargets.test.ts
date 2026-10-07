import { describe, expect, it } from "vitest";
import {
  TARGET_PERIODS, isTargetPeriod, daysInRange, periodDays,
  targetForDays, targetProgress, isDerivedView, ON_TRACK_TOLERANCE,
  rangeForPeriod, brisbaneToday,
} from "@shared/revenueTargets";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("how long a period actually is", () => {
  it("uses the real length of the month, not 30", () => {
    expect(periodDays("monthly", d("2026-02-10"))).toBe(28);
    expect(periodDays("monthly", d("2024-02-10"))).toBe(29); // leap year
    expect(periodDays("monthly", d("2026-10-10"))).toBe(31);
    expect(periodDays("monthly", d("2026-11-10"))).toBe(30);
  });

  it("uses the real length of the quarter, not 90", () => {
    expect(periodDays("quarterly", d("2026-02-10"))).toBe(90); // Jan+Feb+Mar 2026
    expect(periodDays("quarterly", d("2024-02-10"))).toBe(91); // leap year
    expect(periodDays("quarterly", d("2026-05-10"))).toBe(91); // Apr+May+Jun
    expect(periodDays("quarterly", d("2026-10-10"))).toBe(92); // Oct+Nov+Dec
  });

  it("is flat for a day and a week", () => {
    expect(periodDays("daily", d("2026-02-10"))).toBe(1);
    expect(periodDays("weekly", d("2026-02-10"))).toBe(7);
  });
});

describe("counting the days in a window", () => {
  it("counts both ends", () => {
    expect(daysInRange(d("2026-10-07"), d("2026-10-07"))).toBe(1);
    expect(daysInRange(d("2026-10-01"), d("2026-10-07"))).toBe(7);
    expect(daysInRange(d("2026-10-01"), d("2026-10-31"))).toBe(31);
  });
});

describe("scaling one stored target across the views", () => {
  it("shows the stored number unchanged in its own period", () => {
    expect(targetForDays("2000.00", "weekly", 7)).toBe(2000);
    expect(targetForDays("400.00", "daily", 1)).toBe(400);
  });

  it("scales a weekly target down to a day", () => {
    // $2,000 a week over one day.
    expect(targetForDays("2000.00", "weekly", 1)).toBe(285.71);
  });

  it("scales a weekly target up to a month, using that month's length", () => {
    expect(targetForDays("2000.00", "weekly", 31, d("2026-10-01"))).toBe(8857.14);
  });

  it("scales a monthly target by the month it is actually in", () => {
    // The same $8,000 month is worth more per day in February than October.
    const feb = targetForDays("8000.00", "monthly", 1, d("2026-02-01"));
    const oct = targetForDays("8000.00", "monthly", 1, d("2026-10-01"));
    expect(feb).toBe(285.71); // 8000 / 28
    expect(oct).toBe(258.06); // 8000 / 31
    expect(feb).toBeGreaterThan(oct!);
  });

  it("keeps 'no target set' distinct from 'a target of zero'", () => {
    // A zero target puts everyone at 100% of nothing, which reads as success.
    expect(targetForDays(null, "weekly", 7)).toBeNull();
    expect(targetForDays(undefined, "weekly", 7)).toBeNull();
    expect(targetForDays("", "weekly", 7)).toBeNull();
    expect(targetForDays("0.00", "weekly", 7)).toBe(0);
  });

  it("ignores a target that is not a number", () => {
    expect(targetForDays("not money", "weekly", 7)).toBeNull();
  });

  it("knows when a figure on screen was scaled rather than typed", () => {
    expect(isDerivedView("weekly", "weekly")).toBe(false);
    expect(isDerivedView("weekly", "monthly")).toBe(true);
  });
});

describe("how a staff member is doing", () => {
  it("says nothing when no target is set", () => {
    const progress = targetProgress(1200, null);
    expect(progress.status).toBe("no_target");
    expect(progress.ratio).toBeNull();
    expect(progress.difference).toBeNull();
  });

  it("calls a near miss on track rather than behind", () => {
    // $12 short of a $2,000 week is not a miss, and colouring it red every
    // Friday teaches people to ignore the colour.
    expect(targetProgress(1988, 2000).status).toBe("on_track");
    expect(ON_TRACK_TOLERANCE).toBe(0.05);
  });

  it("calls a real shortfall behind", () => {
    const progress = targetProgress(1500, 2000);
    expect(progress.status).toBe("behind");
    expect(progress.difference).toBe(-500);
  });

  it("calls a real beat ahead", () => {
    const progress = targetProgress(2500, 2000);
    expect(progress.status).toBe("ahead");
    expect(progress.difference).toBe(500);
  });

  it("treats a zero target as no target", () => {
    expect(targetProgress(500, 0).status).toBe("no_target");
  });
});

describe("the period values themselves", () => {
  it("accepts only the four", () => {
    expect(TARGET_PERIODS).toEqual(["daily", "weekly", "monthly", "quarterly"]);
    for (const period of TARGET_PERIODS) expect(isTargetPeriod(period)).toBe(true);
    for (const junk of ["yearly", "", null, 7, undefined]) expect(isTargetPeriod(junk)).toBe(false);
  });
});

describe("the window the staff tab compares over", () => {
  it("is just today for a daily target", () => {
    expect(rangeForPeriod("daily", "2026-10-07")).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("runs from Monday to today, not Monday to Sunday", () => {
    // Comparing a whole week's target against Tuesday's takings would show
    // everyone behind until Friday.
    expect(rangeForPeriod("weekly", "2026-10-07")).toEqual({ from: "2026-10-05", to: "2026-10-07" });
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // 11 Oct 2026 is a Sunday; its Monday is the 5th.
    expect(rangeForPeriod("weekly", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  });

  it("starts a Monday's week on that same Monday", () => {
    expect(rangeForPeriod("weekly", "2026-10-05")).toEqual({ from: "2026-10-05", to: "2026-10-05" });
  });

  it("runs from the first of the month to today", () => {
    expect(rangeForPeriod("monthly", "2026-10-07")).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  });

  it("runs from the start of the quarter to today", () => {
    expect(rangeForPeriod("quarterly", "2026-10-07")).toEqual({ from: "2026-10-01", to: "2026-10-07" });
    expect(rangeForPeriod("quarterly", "2026-02-20")).toEqual({ from: "2026-01-01", to: "2026-02-20" });
    expect(rangeForPeriod("quarterly", "2026-08-15")).toEqual({ from: "2026-07-01", to: "2026-08-15" });
  });

  it("compares like with like: the target is scaled to the days elapsed", () => {
    // Three days into the week, a $2,100 weekly target is $900 so far.
    const { from, to } = rangeForPeriod("weekly", "2026-10-07");
    const elapsed = daysInRange(d(from), d(to));
    expect(elapsed).toBe(3);
    expect(targetForDays("2100.00", "weekly", elapsed)).toBe(900);
  });
});

describe("the salon's today", () => {
  it("is the Brisbane date, not the server's", () => {
    // Render runs UTC. At 09:00 Brisbane on the 7th it is still the 6th in
    // UTC, and a server-local date would put the day's takings on the wrong
    // day every morning.
    expect(brisbaneToday(new Date("2026-10-06T23:00:00Z"))).toBe("2026-10-07");
    expect(brisbaneToday(new Date("2026-10-07T13:59:00Z"))).toBe("2026-10-07");
    expect(brisbaneToday(new Date("2026-10-07T14:00:00Z"))).toBe("2026-10-08");
  });
});
