import { describe, expect, it } from "vitest";
import { usualGroomerChangeQuestion } from "./usualGroomerChange";

const roster = new Map([[1, "Charlie"], [2, "Megs"]]);
const name = (id: number) => roster.get(id);

describe("asking before a dog leaves its usual groomer", () => {
  it("asks when a new booking goes to somebody else", () => {
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 1, newGroomerId: 2 }], name))
      .toBe("Bella is usually groomed by Charlie. Change the groomer anyway?");
  });

  it("asks when a new booking is left with nobody", () => {
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 1, newGroomerId: null }], name))
      .toBe("Bella is usually groomed by Charlie. Change the groomer anyway?");
  });

  it("says nothing when the booking is with the usual groomer", () => {
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 1, newGroomerId: 1 }], name)).toBeNull();
  });

  it("says nothing for a dog with no usual groomer", () => {
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: null, newGroomerId: 2 }], name)).toBeNull();
    expect(usualGroomerChangeQuestion([], name)).toBeNull();
  });

  it("says nothing when the usual groomer has left the roster", () => {
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 99, newGroomerId: 2 }], name)).toBeNull();
  });

  it("asks when an existing booking is moved away from the usual groomer", () => {
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 1, currentGroomerId: 1, newGroomerId: 2 }], name))
      .toBe("Bella is usually groomed by Charlie. Change the groomer anyway?");
  });

  it("does not ask again when an existing booking's groomer is not being changed", () => {
    // Already with Megs by an earlier decision; this save only edits a note.
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 1, currentGroomerId: 2, newGroomerId: 2 }], name)).toBeNull();
    // Unassigned and staying unassigned.
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 1, currentGroomerId: null, newGroomerId: null }], name)).toBeNull();
  });

  it("does not ask when an existing booking is moved BACK to the usual groomer", () => {
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 1, currentGroomerId: 2, newGroomerId: 1 }], name)).toBeNull();
  });

  it("names every dog affected, grouped by usual groomer", () => {
    expect(usualGroomerChangeQuestion([
      { petName: "Bella", usualGroomerId: 1, newGroomerId: 2 },
      { petName: "Max", usualGroomerId: 1, newGroomerId: 2 },
      { petName: "Coco", usualGroomerId: 2, newGroomerId: 2 },
    ], name)).toBe("Bella and Max are usually groomed by Charlie. Change the groomer anyway?");
    expect(usualGroomerChangeQuestion([
      { petName: "Bella", usualGroomerId: 1, newGroomerId: null },
      { petName: "Coco", usualGroomerId: 2, newGroomerId: null },
    ], name)).toBe("Bella is usually groomed by Charlie. Coco is usually groomed by Megs. Change the groomer anyway?");
  });

  it("says nothing about a day care booking", () => {
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 1, newGroomerId: null, serviceType: "daycare" }], name)).toBeNull();
    expect(usualGroomerChangeQuestion([{ petName: "Bella", usualGroomerId: 1, newGroomerId: null, serviceType: "classic_groom" }], name)).not.toBeNull();
  });

  it("still asks when a dog has no name on file", () => {
    expect(usualGroomerChangeQuestion([{ petName: null, usualGroomerId: 1, newGroomerId: 2 }], name))
      .toBe("This dog is usually groomed by Charlie. Change the groomer anyway?");
  });
});
