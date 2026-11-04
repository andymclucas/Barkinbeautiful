import { describe, it, expect } from "vitest";
import { groupRemindersByBooking } from "@shared/reminderGrouping";

const at = (h: number) => new Date(2026, 10, 6, h, 30).toISOString();
const row = (appointmentId: number, clientId: number, petName: string, when = at(12)) =>
  ({ appointmentId, clientId, petName, scheduledStart: when });

describe("groupRemindersByBooking", () => {
  it("sends one text for a family booked at the same time", () => {
    const groups = groupRemindersByBooking([
      row(1, 50, "Stella"), row(2, 50, "Belle"), row(3, 50, "Teddy"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].petNames).toEqual(["Stella", "Belle", "Teddy"]);
    expect(groups[0].appointments.map((a) => a.appointmentId)).toEqual([1, 2, 3]);
  });

  it("keeps different clients apart even at the same time", () => {
    const groups = groupRemindersByBooking([row(1, 50, "Stella"), row(2, 60, "Murphy")]);
    expect(groups.map((g) => g.petNames)).toEqual([["Stella"], ["Murphy"]]);
  });

  it("keeps one client's two visits apart", () => {
    const groups = groupRemindersByBooking([
      row(1, 50, "Stella", at(9)), row(2, 50, "Teddy", at(14)),
    ]);
    expect(groups).toHaveLength(2);
  });

  /*
   * session_id is NULL on MoeGo imports, which is nearly every upcoming
   * booking — grouping on it would leave the duplicates exactly where
   * they are commonest. (client, start) does not care.
   */
  it("groups a MoeGo import that carries no session", () => {
    const groups = groupRemindersByBooking([
      { ...row(1, 50, "Albert"), sessionId: null },
      { ...row(2, 50, "Eddy"), sessionId: null },
    ]);
    expect(groups).toHaveLength(1);
  });

  it("claims EVERY row of the booking, not just the one it names from", () => {
    const groups = groupRemindersByBooking([row(1, 50, "Stella"), row(2, 50, "Belle")]);
    expect(groups[0].appointments).toHaveLength(2);
    expect(groups[0].lead.appointmentId).toBe(1);
  });

  it("drops a blank name rather than texting about an empty dog", () => {
    const groups = groupRemindersByBooking([row(1, 50, "Stella"), row(2, 50, "   ")]);
    expect(groups[0].petNames).toEqual(["Stella"]);
    expect(groups[0].appointments).toHaveLength(2);
  });

  it("never collapses rows whose time cannot be read", () => {
    const groups = groupRemindersByBooking([
      { ...row(1, 50, "Stella"), scheduledStart: "nonsense" },
      { ...row(2, 50, "Belle"), scheduledStart: "nonsense" },
    ]);
    expect(groups).toHaveLength(2);
  });

  it("returns nothing for an empty run", () => {
    expect(groupRemindersByBooking([])).toEqual([]);
  });
});
