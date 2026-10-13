import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { actualEndFor } from "@shared/appointmentActualTimes";

const AT = new Date("2026-10-13T04:00:00.000Z");
const EARLIER = new Date("2026-10-13T02:00:00.000Z");

describe("actualEndFor", () => {
  it("stamps the finish time when a dog is marked complete", () => {
    expect(actualEndFor({
      newState: "complete", previousState: "ready", currentActualEnd: null, now: AT,
    })).toEqual(AT);
  });

  it("CLEARS the finish time when a dog comes back out of complete", () => {
    // The rule worth stating. The wall display can put a completed dog back
    // to `ready` — it is the only way to undo a mis-tapped OUT from the
    // floor. Leaving actual_end set would record the dog as having finished
    // at a moment it was still being groomed, and the timing analytics read
    // these actuals.
    expect(actualEndFor({
      newState: "ready", previousState: "complete", currentActualEnd: EARLIER, now: AT,
    })).toBeNull();
  });

  it("leaves it alone on any other move", () => {
    expect(actualEndFor({
      newState: "drying", previousState: "bathing", currentActualEnd: EARLIER, now: AT,
    })).toEqual(EARLIER);
    expect(actualEndFor({
      newState: "grooming", previousState: "waiting_for_groom", currentActualEnd: null, now: AT,
    })).toBeNull();
  });

  it("re-stamps rather than keeping the old time when completed twice", () => {
    // Marked out, pulled back, marked out again: the second finish is the
    // real one.
    expect(actualEndFor({
      newState: "complete", previousState: "ready", currentActualEnd: EARLIER, now: AT,
    })).toEqual(AT);
  });

  it("clears on the way to cancelled or no_show too", () => {
    // A dog pulled back from complete and then cancelled never finished.
    expect(actualEndFor({
      newState: "cancelled", previousState: "complete", currentActualEnd: EARLIER, now: AT,
    })).toBeNull();
  });

  it("is the only copy of the rule", () => {
    const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(source).toContain("actualEndFor({");
    expect(source).not.toContain('actualEnd: input.newState === "complete" ?');
  });
});
