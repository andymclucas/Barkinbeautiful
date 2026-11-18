import { describe, expect, it } from "vitest";
import { getNewSharedSessionPetIds } from "../shared/appointmentSession";

describe("getNewSharedSessionPetIds", () => {
  it("keeps existing family appointment pets intact and returns only new unique pets", () => {
    expect(getNewSharedSessionPetIds([3, 1], [1, 2, 4, 2, 3])).toEqual([2, 4]);
  });
});

import { sessionAddRefusal, sortRequestedSessionPets } from "../shared/appointmentSession";
import { strayedSessionMembers } from "../shared/bookingSiblings";

describe("adding a dog that already carries the booking's label", () => {
  const at = new Date("2026-11-20T02:30:00.000Z"); // Fri 20 Nov, 12:30 pm Brisbane
  const otherDay = new Date("2026-11-19T02:30:00.000Z"); // Thu 19 Nov, 12:30 pm Brisbane
  const row = (petId: number, over: Record<string, unknown> = {}) =>
    ({ petId, petName: petId === 47 ? "Sonny" : "Joy", status: "confirmed", workflowState: "scheduled", scheduledStart: at, ...over });

  it("quietly skips a dog that is live on the booking at this time", () => {
    const sort = sortRequestedSessionPets(at, [row(46), row(47)], [47]);
    expect(sort).toEqual({ alreadyHere: [47], elsewhere: [], notComing: [] });
    expect(sessionAddRefusal(sort)).toBe("");
  });

  it("lets a dog that is not on the booking at all through", () => {
    const sort = sortRequestedSessionPets(at, [row(46)], [47, 47]);
    expect(sort).toEqual({ alreadyHere: [], elsewhere: [], notComing: [] });
  });

  it("says where a dog is when it was left at another time, instead of 'already in this booking'", () => {
    const sort = sortRequestedSessionPets(at, [row(46), row(47, { scheduledStart: otherDay })], [47]);
    expect(sort.alreadyHere).toEqual([]);
    expect(sessionAddRefusal(sort)).toBe(
      "Sonny is part of this booking but is at Thu 19 Nov, 12:30 pm. Move that booking here instead of adding a second one.",
    );
  });

  it("points at Put back on when the dog is on the booking but not coming", () => {
    for (const dead of [{ status: "cancelled" }, { workflowState: "no_show" }]) {
      const sort = sortRequestedSessionPets(at, [row(46), row(47, dead)], [47]);
      expect(sessionAddRefusal(sort)).toBe(
        'Sonny is on this booking but marked as not coming. Use "Put back on" in the booking\'s list of dogs.',
      );
    }
  });

  it("lists the dogs that strayed, for the dialog", () => {
    const joy = { id: 1, sessionId: "s", petId: 46, status: "confirmed", workflowState: "scheduled", scheduledStart: at };
    const sonny = { id: 2, sessionId: "s", petId: 47, status: "confirmed", workflowState: "scheduled", scheduledStart: otherDay };
    const gone = { ...sonny, id: 3, status: "cancelled" };
    expect(strayedSessionMembers(joy, [joy, sonny, gone]).map((m) => m.id)).toEqual([2]);
    expect(strayedSessionMembers(joy, [joy, { ...sonny, scheduledStart: at }])).toEqual([]);
  });
});
