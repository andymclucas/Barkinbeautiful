import { describe, expect, it } from "vitest";
import { BATH_PRIORITY_META, bathQueuePositionMeta, buildBathPriorityQueue, isBathPriorityEligible, isBathPriorityMutable } from "../shared/bathPriorityQueue";

describe("buildBathPriorityQueue", () => {
  it("orders active bathing work from priority one to five and keeps same-session dogs together", () => {
    const queue = buildBathPriorityQueue([
      { id: 3, bathPriority: 2, petName: "Bailee", scheduledStart: "2026-09-03T00:10:00.000Z", sessionId: null, petFamilyGroupId: null, workflowState: "waiting_for_bath" },
      { id: 1, bathPriority: 1, petName: "Brooklyn", scheduledStart: "2026-09-03T00:00:00.000Z", sessionId: "family-booking", petFamilyGroupId: 6, workflowState: "waiting_for_bath" },
      { id: 2, bathPriority: 1, petName: "Ronnie", scheduledStart: "2026-09-03T00:00:00.000Z", sessionId: "family-booking", petFamilyGroupId: 6, workflowState: "waiting_for_bath" },
    ]);

    expect(queue.map((item) => [item.priority, item.petNames, item.isCoordinatedBooking])).toEqual([
      [1, ["Brooklyn", "Ronnie"], true],
      [2, ["Bailee"], false],
    ]);
  });

  it("keeps the queue limited to valid priorities and dogs that still need bathing", () => {
    const queue = buildBathPriorityQueue([
      { id: 1, bathPriority: 6, petName: "Invalid", scheduledStart: "2026-09-03T00:00:00.000Z", workflowState: "waiting_for_bath" },
      { id: 2, bathPriority: 1, petName: "Already drying", scheduledStart: "2026-09-03T00:00:00.000Z", workflowState: "drying" },
      { id: 3, bathPriority: 3, petName: "Ready to bath", scheduledStart: "2026-09-03T00:00:00.000Z", workflowState: "checked_in" },
    ]);

    expect(queue).toHaveLength(1);
    expect(queue[0]?.petNames).toEqual(["Ready to bath"]);
  });

  it("allows priorities only before or during the bathing stage", () => {
    expect(isBathPriorityEligible("scheduled")).toBe(true);
    expect(isBathPriorityEligible("waiting_for_bath")).toBe(true);
    expect(isBathPriorityEligible("bathing")).toBe(true);
    expect(isBathPriorityEligible("drying")).toBe(false);
  });

  it("keeps a priority editable throughout every active workflow stage", () => {
    expect(isBathPriorityMutable("scheduled")).toBe(true);
    expect(isBathPriorityMutable("drying")).toBe(true);
    expect(isBathPriorityMutable("ready")).toBe(true);
    expect(isBathPriorityMutable("complete")).toBe(false);
    expect(isBathPriorityMutable("cancelled")).toBe(false);
  });

  it("orders equal-priority groups using their persisted drag queue position", () => {
    const queue = buildBathPriorityQueue([
      { id: 1, bathPriority: 5, bathQueueOrder: 2, petName: "Later", scheduledStart: "2026-09-03T00:00:00.000Z", workflowState: "waiting_for_bath" },
      { id: 2, bathPriority: 5, bathQueueOrder: 1, petName: "Earlier", scheduledStart: "2026-09-03T01:00:00.000Z", workflowState: "waiting_for_bath" },
    ]);
    expect(queue.map((item) => item.petNames)).toEqual([["Earlier"], ["Later"]]);
  });

  it("defines a distinct accessible colour treatment for every controlled priority", () => {
    expect(Object.keys(BATH_PRIORITY_META)).toEqual(["1", "2", "3", "4", "5"]);
    expect(new Set(Object.values(BATH_PRIORITY_META).map((priority) => priority.colour)).size).toBe(5);
  });
});

describe("queue positions renumber themselves", () => {
  const at = (id: number, bathPriority: number, workflowState: string, petName: string) => ({
    id, bathPriority, petName, workflowState,
    scheduledStart: new Date("2026-10-13T23:00:00Z"),
  });

  it("numbers the queue from 1 whatever the stored priorities are", () => {
    // Nobody is a 1: the dog that was has already gone to the dryer.
    const queue = buildBathPriorityQueue([
      at(1, 3, "waiting_for_bath", "Cosi"),
      at(2, 5, "waiting_for_bath", "Millie"),
      at(3, 4, "waiting_for_bath", "Ralph"),
    ]);
    expect(queue.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(queue.map((item) => item.petNames[0])).toEqual(["Cosi", "Ralph", "Millie"]);
    // The stored intent is untouched — position is derived, not written.
    expect(queue.map((item) => item.priority)).toEqual([3, 4, 5]);
  });

  it("counts down as the dog at the top leaves the queue", () => {
    // This is the behaviour Lauren asked for: bathe the top dog and
    // everything behind it moves up a place by itself.
    const rows = [
      at(1, 1, "waiting_for_bath", "Cosi"),
      at(2, 2, "waiting_for_bath", "Millie"),
      at(3, 3, "waiting_for_bath", "Ralph"),
    ];
    expect(buildBathPriorityQueue(rows).map((i) => [i.petNames[0], i.position]))
      .toEqual([["Cosi", 1], ["Millie", 2], ["Ralph", 3]]);

    const afterCosiIsBathed = [{ ...rows[0], workflowState: "waiting_for_dry" }, rows[1], rows[2]];
    expect(buildBathPriorityQueue(afterCosiIsBathed).map((i) => [i.petNames[0], i.position]))
      .toEqual([["Millie", 1], ["Ralph", 2]]);
  });

  it("keeps a dog in the bath at the top rather than skipping it", () => {
    // A dog being washed right now is still the current one; it leaves the
    // queue when it moves to drying, which is what makes the count go down.
    const queue = buildBathPriorityQueue([
      at(1, 1, "bathing", "Cosi"),
      at(2, 2, "waiting_for_bath", "Millie"),
    ]);
    expect(queue.map((i) => [i.petNames[0], i.position])).toEqual([["Cosi", 1], ["Millie", 2]]);
  });

  it("gives two cohorts on the same priority different positions", () => {
    // Both showing "1" tells a bather nothing about which to pick up.
    const queue = buildBathPriorityQueue([
      at(7, 1, "waiting_for_bath", "Ralph"),
      at(2, 1, "waiting_for_bath", "Beau"),
    ]);
    expect(queue.map((i) => i.position)).toEqual([1, 2]);
    expect(queue.map((i) => i.priority)).toEqual([1, 1]);
  });

  it("gives dogs booked in together one shared position", () => {
    const queue = buildBathPriorityQueue([
      { ...at(1, 1, "waiting_for_bath", "Cosi"), sessionId: "s1" },
      { ...at(2, 1, "waiting_for_bath", "Millie"), sessionId: "s1" },
      at(3, 2, "waiting_for_bath", "Ralph"),
    ]);
    expect(queue).toHaveLength(2);
    expect(queue[0].position).toBe(1);
    expect(queue[0].petNames).toEqual(["Cosi", "Millie"]);
    expect(queue[1].position).toBe(2);
  });
});

describe("bathQueuePositionMeta", () => {
  it("names the first five places the way the salon says them", () => {
    expect(bathQueuePositionMeta(1).label).toBe("Next");
    expect(bathQueuePositionMeta(2).label).toBe("After next");
    expect(bathQueuePositionMeta(5).label).toBe("Fifth");
  });

  it("does not reuse the going-next colour deeper down the queue", () => {
    // The stored priority caps at 5, but several cohorts can share one, so
    // a busy morning runs deeper than the colours do.
    const sixth = bathQueuePositionMeta(6);
    expect(sixth.label).toBe("6th in line");
    expect(sixth.colour).not.toBe(bathQueuePositionMeta(1).colour);
  });
});
