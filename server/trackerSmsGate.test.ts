import { describe, it, expect } from "vitest";
import { trackerSmsAllowed } from "../shared/trackerSmsGate";

describe("trackerSmsAllowed", () => {
  it("is OFF when the variable is unset — the state Andy asked for", () => {
    // Two clients had already been texted that morning and 706 future
    // bookings would each have texted on arrival.
    expect(trackerSmsAllowed({ SMS_AUTOMATION_ENABLED: "true" })).toBe(false);
    expect(trackerSmsAllowed({ SMS_AUTOMATION_ENABLED: "true", TRACKER_SMS_ENABLED: undefined })).toBe(false);
  });

  it("only sends when BOTH switches are on", () => {
    expect(trackerSmsAllowed({ SMS_AUTOMATION_ENABLED: "true", TRACKER_SMS_ENABLED: "true" })).toBe(true);
  });

  it("stays off while global SMS automation is off", () => {
    // Turning the tracker on must not route around the global gate.
    expect(trackerSmsAllowed({ SMS_AUTOMATION_ENABLED: "false", TRACKER_SMS_ENABLED: "true" })).toBe(false);
    expect(trackerSmsAllowed({ TRACKER_SMS_ENABLED: "true" })).toBe(false);
  });

  it("wants the exact string, not anything truthy", () => {
    // "TRUE", "1" and "yes" are how a switch gets turned on by accident.
    for (const v of ["TRUE", "1", "yes", "on", " true"]) {
      expect(trackerSmsAllowed({ SMS_AUTOMATION_ENABLED: "true", TRACKER_SMS_ENABLED: v })).toBe(false);
    }
  });

  it("does not disturb the reminders, which have their own gate", () => {
    // The reminders read SMS_AUTOMATION_ENABLED directly. Stopping the
    // tracker by turning that off would silently cancel them too.
    expect(trackerSmsAllowed({ SMS_AUTOMATION_ENABLED: "true" })).toBe(false);
  });
});
