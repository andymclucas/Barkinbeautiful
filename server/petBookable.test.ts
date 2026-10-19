import { describe, it, expect } from "vitest";
import {
  PET_CANNOT_BE_SELECTED,
  departedBookingMessage,
  departedPetsIn,
  petHasPassedAway,
} from "@shared/petBookable";

const alive = { id: 1, name: "Rosie", status: "active" };
const gone = { id: 3, name: "Tyson", status: "departed" };

describe("petHasPassedAway", () => {
  it("is true only for a departed record", () => {
    expect(petHasPassedAway(gone)).toBe(true);
    expect(petHasPassedAway(alive)).toBe(false);
  });

  it("treats a missing status as alive", () => {
    // Older rows and anything selected without the column must not all
    // become unbookable.
    expect(petHasPassedAway({ status: null })).toBe(false);
    expect(petHasPassedAway({ status: undefined })).toBe(false);
    expect(petHasPassedAway({} as any)).toBe(false);
  });
});

describe("departedBookingMessage", () => {
  it("says nothing when every dog can be booked", () => {
    expect(departedBookingMessage([alive, { id: 2, name: "Teddy", status: "active" }])).toBeNull();
    expect(departedBookingMessage([])).toBeNull();
  });

  it("names the dog, rather than saying the selection is unavailable", () => {
    // "The selected pets are not available to this salon" makes somebody
    // think the system is broken and try again.
    expect(departedBookingMessage([alive, gone]))
      .toBe("Tyson has been recorded as passed away and cannot be booked.");
  });

  it("lists several the way a person would say them", () => {
    const msg = departedBookingMessage([
      gone, { id: 4, name: "Bluey", status: "departed" }, { id: 5, name: "Mack", status: "departed" },
    ]);
    expect(msg).toBe("Tyson, Bluey and Mack have been recorded as passed away and cannot be booked.");
  });

  it("still refuses when the name is missing", () => {
    const msg = departedBookingMessage([{ id: 9, name: null, status: "departed" }]);
    expect(msg).toContain("cannot be booked");
    expect(msg).not.toMatch(/null|undefined/);
  });

  it("picks out only the departed ones", () => {
    expect(departedPetsIn([alive, gone]).map((p) => p.id)).toEqual([3]);
  });
});

describe("the form's own wording", () => {
  it("is what Andy asked for, verbatim", () => {
    expect(PET_CANNOT_BE_SELECTED).toBe("This pet cannot be selected");
  });
});
