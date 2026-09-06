import { describe, expect, it } from "vitest";
import { resolveAppointmentDeletionIds } from "../shared/appointmentDeletion";

describe("resolveAppointmentDeletionIds", () => {
  it("deletes only the selected appointment when it is not part of a session", () => {
    expect(resolveAppointmentDeletionIds(42, null, [])).toEqual([42]);
  });

  it("deletes every pet appointment in the selected booking session", () => {
    expect(resolveAppointmentDeletionIds(42, "session-abc", [42, 43])).toEqual([42, 43]);
  });

  it("deduplicates the selected appointment when the session query includes it", () => {
    expect(resolveAppointmentDeletionIds(42, "session-abc", [42, 43, 42])).toEqual([42, 43]);
  });
});
