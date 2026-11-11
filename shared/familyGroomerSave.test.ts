import { describe, expect, it } from "vitest";
import { familyRescheduleCalls } from "./familyGroomerSave";

// Trixie & Teddy, 12/11/2026: one booking at 9:30, both with Brooklyn (5).
// Sabina is 11.
const trixie = { id: 1230097, staffId: 5, scheduledStart: "2026-11-11T23:30:00.000Z", scheduledEnd: "2026-11-12T01:30:00.000Z" };
const teddy = { id: 2640144, staffId: 5, scheduledStart: "2026-11-11T23:30:00.000Z", scheduledEnd: "2026-11-12T01:30:00.000Z" };
const form = { staffId: "5", scheduledStart: "2026-11-12T09:30", scheduledEnd: "2026-11-12T11:30" };

describe("saving each dog's groomer on a booking", () => {
  it("saves the FIRST dog's new groomer — the change that was being lost", () => {
    const calls = familyRescheduleCalls({ primary: trixie, siblings: [teddy], pickedGroomers: { [trixie.id]: "11" }, form });
    expect(calls).toEqual([
      { appointmentId: trixie.id, scheduledStart: "2026-11-12T09:30", scheduledEnd: "2026-11-12T11:30", staffId: 11 },
    ]);
  });

  it("saves both dogs when both are changed", () => {
    const calls = familyRescheduleCalls({ primary: trixie, siblings: [teddy], pickedGroomers: { [trixie.id]: "11", [teddy.id]: "11" }, form });
    expect(calls.map((c) => [c.appointmentId, c.staffId])).toEqual([[trixie.id, 11], [teddy.id, 11]]);
  });

  it("can unassign a dog", () => {
    const calls = familyRescheduleCalls({ primary: trixie, siblings: [teddy], pickedGroomers: { [teddy.id]: "" }, form });
    expect(calls[1]).toMatchObject({ appointmentId: teddy.id, staffId: null });
  });

  it("leaves an untouched dog alone, and keeps the first dog's groomer when nobody changed it", () => {
    const calls = familyRescheduleCalls({ primary: trixie, siblings: [teddy], pickedGroomers: {}, form });
    expect(calls).toEqual([{ appointmentId: trixie.id, scheduledStart: form.scheduledStart, scheduledEnd: form.scheduledEnd, staffId: 5 }]);
  });

  it("uses the single-dog field when there is only one dog", () => {
    const calls = familyRescheduleCalls({ primary: trixie, siblings: [], pickedGroomers: { [trixie.id]: "11" }, form: { ...form, staffId: "3" } });
    expect(calls).toEqual([{ appointmentId: trixie.id, scheduledStart: form.scheduledStart, scheduledEnd: form.scheduledEnd, staffId: 3 }]);
  });

  it("keeps a staggered sibling on its own time instead of pulling it onto the first dog's", () => {
    // Teddy at 10:00–11:00, half an hour after Trixie.
    const late = { ...teddy, scheduledStart: "2026-11-12T00:00:00.000Z", scheduledEnd: "2026-11-12T01:00:00.000Z" };
    const calls = familyRescheduleCalls({ primary: trixie, siblings: [late], pickedGroomers: { [late.id]: "11" }, form });
    expect(calls[1]).toMatchObject({ scheduledStart: "2026-11-12T10:00", scheduledEnd: "2026-11-12T11:00" });
  });

  it("moves a sibling by however far the first dog moved", () => {
    const late = { ...teddy, scheduledStart: "2026-11-12T00:00:00.000Z", scheduledEnd: "2026-11-12T01:00:00.000Z" };
    const movedForm = { ...form, scheduledStart: "2026-11-12T11:00", scheduledEnd: "2026-11-12T13:00" }; // +1h30
    const calls = familyRescheduleCalls({ primary: trixie, siblings: [late], pickedGroomers: { [late.id]: "11" }, form: movedForm });
    expect(calls[1]).toMatchObject({ scheduledStart: "2026-11-12T11:30", scheduledEnd: "2026-11-12T12:30" });
  });
});
