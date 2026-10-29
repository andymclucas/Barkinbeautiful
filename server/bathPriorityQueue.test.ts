import { describe, expect, it } from "vitest";
import {
  BATH_PRIORITY_META,
  bathQueuePositionMeta,
  buildBathPriorityQueue,
  isBathPriorityEligible,
  isBathPriorityMutable,
  bathPriorityScope,
  bathPriorityChangeReaches,
} from "../shared/bathPriorityQueue";

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

describe("bathPriorityScope", () => {
  const anchor = (over: Partial<Parameters<typeof bathPriorityScope>[0]> = {}) =>
    ({ id: 1, bathGroupId: null, sessionId: null, petFamilyGroupId: null, ...over });

  it("reaches only this dog when asked for this dog only", () => {
    expect(bathPriorityScope(anchor({ petFamilyGroupId: 7, sessionId: "s1" }), false))
      .toEqual({ kind: "alone", appointmentId: 1 });
  });

  /** The precedence that was already there, pinned so it cannot drift. */
  it("prefers an explicit bath group over a session or a family", () => {
    expect(bathPriorityScope(anchor({ bathGroupId: "bath-x", sessionId: "s1", petFamilyGroupId: 7 }), true))
      .toEqual({ kind: "bathGroup", bathGroupId: "bath-x" });
  });

  it("prefers a session over a family", () => {
    expect(bathPriorityScope(anchor({ sessionId: "s1", petFamilyGroupId: 7 }), true))
      .toEqual({ kind: "session", sessionId: "s1" });
  });

  it("falls back to the family cohort", () => {
    expect(bathPriorityScope(anchor({ petFamilyGroupId: 7 }), true))
      .toEqual({ kind: "family", petFamilyGroupId: 7 });
  });

  it("is alone when the dog belongs to nothing", () => {
    expect(bathPriorityScope(anchor(), true)).toEqual({ kind: "alone", appointmentId: 1 });
  });

  it("ignores a blank group or session rather than treating it as one", () => {
    expect(bathPriorityScope(anchor({ bathGroupId: "  ", sessionId: "  ", petFamilyGroupId: 7 }), true))
      .toEqual({ kind: "family", petFamilyGroupId: 7 });
  });
});

describe("bathPriorityChangeReaches", () => {
  /**
   * Lauren's case, both halves at once: Bear and Abby grouped, then
   * Ollie numbered. Ollie's change runs on the FAMILY scope, and must
   * not pull Abby — she has been deliberately grouped elsewhere.
   */
  it("leaves an explicitly grouped dog alone during a family change", () => {
    const scope = bathPriorityScope({ id: 10, petFamilyGroupId: 7 }, true);   // Ollie
    expect(bathPriorityChangeReaches(scope, { id: 10 })).toBe(true);            // Ollie himself
    expect(bathPriorityChangeReaches(scope, { id: 11, bathGroupId: "bath-x" })).toBe(false); // Abby
  });

  it("does the same for a session change", () => {
    const scope = bathPriorityScope({ id: 10, sessionId: "s1" }, true);
    expect(bathPriorityChangeReaches(scope, { id: 11, bathGroupId: "bath-x" })).toBe(false);
    expect(bathPriorityChangeReaches(scope, { id: 12, bathGroupId: null })).toBe(true);
  });

  /** Inside a bath group, moving one moves them all — that is the point. */
  it("reaches every dog in an explicit bath group", () => {
    const scope = bathPriorityScope({ id: 10, bathGroupId: "bath-x" }, true);
    expect(bathPriorityChangeReaches(scope, { id: 11, bathGroupId: "bath-x" })).toBe(true);
  });

  it("reaches nobody else when the change is for one dog", () => {
    const scope = bathPriorityScope({ id: 10, petFamilyGroupId: 7 }, false);
    expect(bathPriorityChangeReaches(scope, { id: 10 })).toBe(true);
    expect(bathPriorityChangeReaches(scope, { id: 11 })).toBe(false);
  });
});

describe("a dog bathed on its own", () => {
  /**
   * A bath group of ONE is how a dog is split out of its automatic
   * family cohort — queueCohortKey checks bathGroupId before
   * petFamilyGroupId, so the group wins and the dog becomes its own
   * queue item with its own number.
   */
  it("gets its own queue position away from its family", () => {
    const rows = [
      { id: 1, petName: "Ollie", bathPriority: 3, workflowState: "scheduled", scheduledStart: "2026-10-30T22:30:00Z", petFamilyGroupId: 7, bathGroupId: "bath-solo", sessionId: null, bathQueueOrder: null },
      { id: 2, petName: "Abby", bathPriority: 2, workflowState: "scheduled", scheduledStart: "2026-10-30T22:30:00Z", petFamilyGroupId: 7, bathGroupId: "bath-pair", sessionId: null, bathQueueOrder: null },
      { id: 3, petName: "Bear", bathPriority: 2, workflowState: "scheduled", scheduledStart: "2026-10-30T23:00:00Z", petFamilyGroupId: null, bathGroupId: "bath-pair", sessionId: null, bathQueueOrder: null },
    ];
    const queue = buildBathPriorityQueue(rows as any);
    const abbyAndBear = queue.find((i) => i.petNames.includes("Abby"))!;
    expect(abbyAndBear.petNames.sort()).toEqual(["Abby", "Bear"]);
    const ollie = queue.find((i) => i.petNames.includes("Ollie"))!;
    expect(ollie.petNames).toEqual(["Ollie"]);
    expect(ollie.rows).toHaveLength(1);
    expect(abbyAndBear.position).toBeLessThan(ollie.position);
  });
});

describe("Lauren's board, 30/10/2026", () => {
  /**
   * The real rows: Ollie and Abby Brown share a family AND a session at
   * 08:30, Bear Drohan is alone at 09:00. She wanted Bear and Abby
   * bathed together because they are small, and Ollie given number 3.
   *
   * 91 upcoming bookings have this same shape, so this is not one
   * awkward pair.
   */
  const OLLIE = { id: 1230051, petFamilyGroupId: 630006, sessionId: "z68PxyRzrsGGRYo5", bathGroupId: null };
  const ABBY_GROUPED = { id: 1230052, bathGroupId: "bath-pair" };

  it("lets Ollie take his own number without dragging Abby back", () => {
    // Ollie carries a session, so the session rule applies to him...
    const scope = bathPriorityScope(OLLIE, true);
    expect(scope).toEqual({ kind: "session", sessionId: "z68PxyRzrsGGRYo5" });
    // ...but it must not reach Abby, who is now grouped with Bear.
    expect(bathPriorityChangeReaches(scope, ABBY_GROUPED)).toBe(false);
    expect(bathPriorityChangeReaches(scope, { id: OLLIE.id, bathGroupId: null })).toBe(true);
  });

  it("puts Abby with Bear and Ollie on his own in the queue", () => {
    const queue = buildBathPriorityQueue([
      { id: 1230051, petName: "Ollie", bathPriority: 3, workflowState: "scheduled", scheduledStart: "2026-10-29T22:30:00Z", petFamilyGroupId: 630006, sessionId: "z68PxyRzrsGGRYo5", bathGroupId: null, bathQueueOrder: null },
      { id: 1230052, petName: "Abby", bathPriority: 2, workflowState: "scheduled", scheduledStart: "2026-10-29T22:30:00Z", petFamilyGroupId: 630006, sessionId: "z68PxyRzrsGGRYo5", bathGroupId: "bath-pair", bathQueueOrder: null },
      { id: 1200008, petName: "Bear", bathPriority: 2, workflowState: "scheduled", scheduledStart: "2026-10-29T23:00:00Z", petFamilyGroupId: null, sessionId: null, bathGroupId: "bath-pair", bathQueueOrder: null },
    ] as any);
    expect(queue.map((i) => i.petNames.slice().sort().join("+"))).toEqual(["Abby+Bear", "Ollie"]);
  });

  /** Before the fix: one cohort, one number, nothing she could do. */
  it("shows what she was stuck with — one item for both dogs", () => {
    const queue = buildBathPriorityQueue([
      { id: 1230051, petName: "Ollie", bathPriority: 2, workflowState: "scheduled", scheduledStart: "2026-10-29T22:30:00Z", petFamilyGroupId: 630006, sessionId: "z68PxyRzrsGGRYo5", bathGroupId: null, bathQueueOrder: null },
      { id: 1230052, petName: "Abby", bathPriority: 2, workflowState: "scheduled", scheduledStart: "2026-10-29T22:30:00Z", petFamilyGroupId: 630006, sessionId: "z68PxyRzrsGGRYo5", bathGroupId: null, bathQueueOrder: null },
    ] as any);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.petNames.slice().sort()).toEqual(["Abby", "Ollie"]);
  });
});
