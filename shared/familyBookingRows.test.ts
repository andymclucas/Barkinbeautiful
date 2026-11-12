import { describe, expect, it } from "vitest";
import { companionsOf, joinNames } from "./familyBookingRows";
import { resolveAppointmentDeletionIds } from "./appointmentDeletion";

const rows = [
  { id: 1, sessionId: "a", petName: "Maddie", workflowState: "scheduled" },
  { id: 2, sessionId: "a", petName: "Misha", workflowState: "scheduled" },
  { id: 3, sessionId: "a", petName: "Bear", workflowState: "cancelled" },
  { id: 4, sessionId: "b", petName: "Maddie", workflowState: "scheduled" },
  { id: 5, sessionId: null, petName: "Misha", workflowState: "scheduled" },
];

describe("companionsOf", () => {
  it("finds the other dogs on the same booking that are still coming", () => {
    expect(companionsOf(rows[0], rows).map((r) => r.id)).toEqual([2]);
  });
  it("is empty for a dog booked on its own", () => {
    expect(companionsOf(rows[3], rows)).toEqual([]);
    expect(companionsOf(rows[4], rows)).toEqual([]);
  });
});

describe("joinNames", () => {
  it("reads naturally", () => {
    expect(joinNames(["Misha"])).toBe("Misha");
    expect(joinNames(["Misha", "Bear"])).toBe("Misha and Bear");
    expect(joinNames(["Misha", "Bear", null])).toBe("Misha, Bear and another dog");
  });
});

describe("deleting one dog", () => {
  it("takes only that dog when asked, and the whole booking otherwise", () => {
    expect(resolveAppointmentDeletionIds(1, "a", [1, 2], true)).toEqual([1]);
    expect(resolveAppointmentDeletionIds(1, "a", [1, 2])).toEqual([1, 2]);
  });
});
