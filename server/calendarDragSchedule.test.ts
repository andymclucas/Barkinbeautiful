import { describe, expect, it } from "vitest";
import { buildAestDragSchedule } from "../client/src/lib/calendarDragSchedule";

describe("buildAestDragSchedule", () => {
  it("keeps a Tuesday 2:00pm AEST cross-groomer drag on the intended calendar day and time", () => {
    const schedule = buildAestDragSchedule({
      sourceStart: new Date("2026-08-18T04:00:00.000Z"),
      durationMs: 120 * 60_000,
      minutesFromSeven: 7 * 60,
    });

    expect(schedule.scheduledStartIso).toBe("2026-08-18T04:00:00.000Z");
    expect(schedule.scheduledEndIso).toBe("2026-08-18T06:00:00.000Z");
  });

  it("preserves the appointment duration when dropped into another staff column", () => {
    const schedule = buildAestDragSchedule({
      sourceStart: new Date("2026-08-18T04:00:00.000Z"),
      durationMs: 90 * 60_000,
      minutesFromSeven: 30,
    });

    expect(schedule.scheduledStartIso).toBe("2026-08-17T21:30:00.000Z");
    expect(schedule.scheduledEndIso).toBe("2026-08-17T23:00:00.000Z");
  });
});
