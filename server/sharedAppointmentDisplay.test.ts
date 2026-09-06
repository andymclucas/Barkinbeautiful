import { describe, expect, it } from "vitest";
import { formatSharedAppointmentName } from "../shared/appointmentDisplay";

describe("formatSharedAppointmentName", () => {
  it("shows every booked pet before the household surname", () => {
    expect(formatSharedAppointmentName({ petNames: ["Molly", "Blits"], surname: "Aitken" })).toBe("Molly & Blits Aitken");
    expect(formatSharedAppointmentName({ petNames: ["Chester", "Snickers"], surname: "Waldon" })).toBe("Chester & Snickers Waldon");
  });

  it("does not add separators for missing pet names", () => {
    expect(formatSharedAppointmentName({ petNames: ["Molly", null, "  "], surname: "Aitken" })).toBe("Molly Aitken");
  });

  it("keeps the supplied booked-pet order before the household surname", () => {
    expect(formatSharedAppointmentName({ petNames: ["Molly", "Blits", "Pip"], surname: "Aitken" })).toBe("Molly & Blits & Pip Aitken");
  });
});
