import { describe, expect, it } from "vitest";
import { KANBAN_COLUMNS, groupIntoKanbanColumns, isWaitingInColumn, kanbanColumnFor } from "./workflowKanbanColumns";

const ALL_ACTIVE_STATES = [
  "scheduled", "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying",
  "waiting_for_groom", "grooming", "ready", "complete",
];

describe("kanbanColumnFor", () => {
  it("puts every working state in exactly one column", () => {
    for (const state of ALL_ACTIVE_STATES) {
      expect(KANBAN_COLUMNS.filter((c) => c.states.includes(state)), state).toHaveLength(1);
    }
  });

  it("files waiting dogs with the area they are waiting for", () => {
    expect(kanbanColumnFor("waiting_for_bath")).toBe("bath");
    expect(kanbanColumnFor("checked_in")).toBe("bath");
    expect(kanbanColumnFor("waiting_for_dry")).toBe("dry");
    expect(kanbanColumnFor("grooming")).toBe("groom");
  });

  it("gives dogs waiting for a groomer their own area (Lauren, 24/11/2026)", () => {
    expect(kanbanColumnFor("waiting_for_groom")).toBe("wait_groom");
    expect(KANBAN_COLUMNS.map((c) => c.key)).toEqual(["arriving", "bath", "dry", "wait_groom", "groom", "ready", "out"]);
  });

  it("gives cancelled and no-show dogs no column", () => {
    expect(kanbanColumnFor("cancelled")).toBeNull();
    expect(kanbanColumnFor("no_show")).toBeNull();
  });

  it("drops a card onto the state being worked in, inside its own column", () => {
    for (const c of KANBAN_COLUMNS) expect(c.states).toContain(c.dropState);
  });
});

describe("isWaitingInColumn", () => {
  it("is true only for checked in and the waiting states", () => {
    expect(ALL_ACTIVE_STATES.filter(isWaitingInColumn)).toEqual(["checked_in", "waiting_for_bath", "waiting_for_dry", "waiting_for_groom"]);
  });
});

describe("groupIntoKanbanColumns", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 23, h));
  const dog = (id: number, workflowState: string, h: number) => ({ id, workflowState, scheduledStart: at(h) });

  it("puts the dog being worked on above the dogs waiting, then booking order", () => {
    const rows = [dog(1, "waiting_for_bath", 21), dog(2, "bathing", 23), dog(3, "checked_in", 20), dog(4, "bathing", 22)];
    const bath = groupIntoKanbanColumns(rows, { showOut: false }).find((g) => g.column.key === "bath")!;
    expect(bath.rows.map((r) => r.id)).toEqual([4, 2, 3, 1]);
  });

  it("leaves the Out column off unless finished dogs are being shown", () => {
    const rows = [dog(1, "complete", 21)];
    expect(groupIntoKanbanColumns(rows, { showOut: false }).map((g) => g.column.key)).not.toContain("out");
    const out = groupIntoKanbanColumns(rows, { showOut: true }).find((g) => g.column.key === "out")!;
    expect(out.rows).toHaveLength(1);
  });

  it("drops dogs with no column rather than inventing one", () => {
    const groups = groupIntoKanbanColumns([dog(1, "cancelled", 21)], { showOut: true });
    expect(groups.flatMap((g) => g.rows)).toEqual([]);
  });
});
