import { describe, expect, it } from "vitest";
import {
  missingFromNewAppointment, newAppointmentError, autoSelectedPetIds,
} from "@shared/newAppointmentValidation";

const full = {
  clientId: "412", petIds: ["900"],
  scheduledStart: "2026-10-08T09:00", scheduledEnd: "2026-10-08T11:30",
};

describe("telling somebody what is actually missing", () => {
  it("says nothing when the form is complete", () => {
    expect(newAppointmentError(full)).toBeNull();
    expect(missingFromNewAppointment(full)).toEqual([]);
  });

  it("names only the dog when only the dog is missing", () => {
    // This is the exact state of the booking that failed on 08/10/2026:
    // client chosen, times chosen, pet chip never tapped. The old message
    // listed client, pet and times together, so the groomer could not tell
    // which one it meant and started filling in Notes.
    expect(newAppointmentError({ ...full, petIds: [] }))
      .toBe("Still needed: which dog this is for.");
  });

  it("names only the client when only the client is missing", () => {
    expect(newAppointmentError({ ...full, clientId: "" }))
      .toBe("Still needed: a client.");
  });

  it("names only the times when only the times are missing", () => {
    expect(newAppointmentError({ ...full, scheduledEnd: "" }))
      .toBe("Still needed: a start and end time.");
  });

  it("lists several readably", () => {
    expect(newAppointmentError({ clientId: "", petIds: [], scheduledStart: "", scheduledEnd: "" }))
      .toBe("Still needed: a client, which dog this is for and a start and end time.");
  });

  it("never asks for notes, which are not required", () => {
    // The groomer typed "Nil" into Notes trying to satisfy this.
    const message = newAppointmentError({ clientId: "", petIds: [], scheduledStart: "", scheduledEnd: "" });
    expect(message?.toLowerCase()).not.toContain("note");
  });
});

describe("a client with one dog", () => {
  it("has that dog chosen already", () => {
    expect(autoSelectedPetIds([900])).toEqual(["900"]);
  });

  it("leaves a choice to be made when there are two", () => {
    // Guessing here books the wrong dog, which is worse than an extra tap.
    expect(autoSelectedPetIds([900, 901])).toEqual([]);
  });

  it("copes with a client who has none", () => {
    expect(autoSelectedPetIds([])).toEqual([]);
  });
});
