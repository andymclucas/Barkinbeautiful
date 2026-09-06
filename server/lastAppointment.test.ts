import { describe, expect, it } from "vitest";
import { resolveLastAppointmentDates } from "./lastAppointment";

describe("resolveLastAppointmentDates", () => {
  it("uses the newest valid prior visit for each pet and skips cancelled or no-show placeholders", () => {
    const dates = resolveLastAppointmentDates([
      { petId: 1, scheduledStart: new Date("2026-08-01T00:00:00Z"), status: "cancelled" },
      { petId: 1, scheduledStart: new Date("2026-07-12T00:00:00Z"), status: "confirmed" },
      { petId: 1, scheduledStart: new Date("2026-06-01T00:00:00Z"), status: "confirmed" },
      { petId: 2, scheduledStart: new Date("2026-07-20T00:00:00Z"), status: "no_show" },
      { petId: 2, scheduledStart: new Date("2026-06-20T00:00:00Z"), status: "confirmed" },
    ]);

    expect(dates[1].toISOString()).toBe("2026-07-12T00:00:00.000Z");
    expect(dates[2].toISOString()).toBe("2026-06-20T00:00:00.000Z");
  });
});
