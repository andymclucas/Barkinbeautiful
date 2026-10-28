import { describe, it, expect } from "vitest";
import { buildRescheduleUpdate } from "../shared/rescheduleUpdate";

const START = new Date("2026-10-27T23:00:00Z");
const END = new Date("2026-10-28T06:00:00Z");

describe("buildRescheduleUpdate", () => {
  /**
   * The bug this exists to prevent. Poppy's daycare on 28/10/2026 is
   * assigned to Charlotte; changing only her time must not take her off
   * Charlotte on the way through.
   */
  it("leaves the groomer alone when no staff id is sent", () => {
    const update = buildRescheduleUpdate({ scheduledStart: START, scheduledEnd: END });
    expect("staffId" in update).toBe(false);
  });

  it("unassigns on an explicit null, which is how a drag to Unassigned works", () => {
    const update = buildRescheduleUpdate({ scheduledStart: START, scheduledEnd: END, staffId: null });
    expect(update.staffId).toBeNull();
  });

  it("assigns the groomer it is given", () => {
    const update = buildRescheduleUpdate({ scheduledStart: START, scheduledEnd: END, staffId: 3 });
    expect(update.staffId).toBe(3);
  });

  it("always writes both times", () => {
    const update = buildRescheduleUpdate({ scheduledStart: START, scheduledEnd: END });
    expect(update.scheduledStart).toBe(START);
    expect(update.scheduledEnd).toBe(END);
  });
});
