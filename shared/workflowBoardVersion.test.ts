import { describe, expect, it } from "vitest";
import { boardVersionChanged, workflowBoardDayBounds, workflowBoardVersion } from "./workflowBoardVersion";

describe("workflowBoardDayBounds", () => {
  it("covers the Brisbane day, midnight to midnight", () => {
    const { start, end } = workflowBoardDayBounds("2026-11-24");
    expect(start.toISOString()).toBe("2026-11-23T14:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-24T13:59:59.999Z");
  });

  it("crosses a month boundary", () => {
    expect(workflowBoardDayBounds("2026-12-01").start.toISOString()).toBe("2026-11-30T14:00:00.000Z");
  });
});

describe("workflowBoardVersion", () => {
  const t = new Date("2026-11-24T00:00:05Z");

  it("changes when a booking changes or one is added or removed", () => {
    const base = workflowBoardVersion(12, t);
    expect(workflowBoardVersion(12, new Date(t.getTime() + 1000))).not.toBe(base);
    expect(workflowBoardVersion(13, t)).not.toBe(base);
    expect(workflowBoardVersion(11, t)).not.toBe(base);
  });

  it("is stable for the same day state, whatever form the driver returns", () => {
    expect(workflowBoardVersion(12, t)).toBe(workflowBoardVersion("12" as unknown as number, t.toISOString()));
  });

  it("handles an empty day", () => {
    expect(workflowBoardVersion(0, null)).toBe("0:0");
  });
});

describe("boardVersionChanged", () => {
  it("reloads only on a real change", () => {
    expect(boardVersionChanged(undefined, "3:1")).toBe(false);
    expect(boardVersionChanged("3:1", "3:1")).toBe(false);
    expect(boardVersionChanged("3:1", undefined)).toBe(false);
    expect(boardVersionChanged("3:1", "3:2")).toBe(true);
  });
});
