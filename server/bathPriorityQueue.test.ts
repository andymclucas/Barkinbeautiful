import { describe, expect, it } from "vitest";
import { BATH_PRIORITY_META, buildBathPriorityQueue, isBathPriorityEligible, isBathPriorityMutable } from "../shared/bathPriorityQueue";

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
