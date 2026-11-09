import { describe, expect, it } from "vitest";
import { recurringOccurrenceRefusal } from "@shared/recurringOccurrence";

/**
 * Lauren, 10/11/2026: a six-weekly series, four dates, every one of them
 * refused with "the groomer is already busy". Nobody was away. The
 * groomer had another dog at 7:30, as they do most mornings.
 */
describe("whether a recurring occurrence can go in", () => {
  it("lets a booking through when the groomer merely has another dog", () => {
    /*
     * The case that was broken. An overlap is how this salon runs —
     * 14,445 overlapping pairs against 12,728 appointments — so a rule
     * that refuses on one refuses nearly every booking.
     */
    expect(
      recurringOccurrenceRefusal({ blockouts: [], dogsAlreadyBooked: [] })
    ).toBeNull();
  });

  it("refuses when the groomer is on leave, and says why", () => {
    expect(
      recurringOccurrenceRefusal({
        blockouts: [
          { staffId: 3, staffName: "Charlie", reason: "Annual leave" },
        ],
        dogsAlreadyBooked: [],
      })
    ).toBe("Charlie is not working then — Annual leave");
  });

  it("still refuses when the leave has no reason on it", () => {
    expect(
      recurringOccurrenceRefusal({
        blockouts: [{ staffId: 3, staffName: "Charlie" }],
        dogsAlreadyBooked: [],
      })
    ).toBe("Charlie is not working then");
  });

  it("names both groomers when a family is split and both are away", () => {
    // A family booking skips as a whole, so the reason has to account
    // for everyone it needed.
    expect(
      recurringOccurrenceRefusal({
        blockouts: [
          { staffId: 3, staffName: "Charlie", reason: "Annual leave" },
          { staffId: 4, staffName: "Zakaria", reason: "Annual leave" },
        ],
        dogsAlreadyBooked: [],
      })
    ).toBe("Charlie and Zakaria are not working then — Annual leave");
  });

  it("falls back to a name when the staff row has none", () => {
    expect(
      recurringOccurrenceRefusal({
        blockouts: [{ staffId: 3, staffName: null, reason: null }],
        dogsAlreadyBooked: [],
      })
    ).toBe("The groomer is not working then");
  });

  it("refuses a dog already booked that day, in the shared wording", () => {
    // One wording for this across every booking path, so a client never
    // hears it two ways.
    expect(
      recurringOccurrenceRefusal({
        blockouts: [],
        dogsAlreadyBooked: [{ petId: 196, petName: "Maddie" }],
        duplicateMessage: "Maddie is already booked that day",
      })
    ).toBe("Maddie is already booked that day");
  });

  it("says something rather than nothing if the wording goes missing", () => {
    expect(
      recurringOccurrenceRefusal({
        blockouts: [],
        dogsAlreadyBooked: [{ petId: 196, petName: "Maddie" }],
      })
    ).toBe("Already booked that day");
  });

  it("puts leave before the dog's own day", () => {
    /*
     * Leave cannot be resolved by moving the dog an hour, and it is
     * nobody's mistake. A duplicate usually is, so it reads better
     * second.
     */
    expect(
      recurringOccurrenceRefusal({
        blockouts: [{ staffId: 3, staffName: "Charlie", reason: "Sydney" }],
        dogsAlreadyBooked: [{ petId: 196, petName: "Maddie" }],
        duplicateMessage: "Maddie is already booked that day",
      })
    ).toBe("Charlie is not working then — Sydney");
  });
});
