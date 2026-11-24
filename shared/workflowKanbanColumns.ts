/**
 * Simple mode for the workflow board: the day as columns, one per area of
 * the salon, with each dog's card in the area it is in.
 *
 * Andy, 23/11/2026: "a toggle for 'Simple Mode' - which is the Kanban style
 * view with only the dogs in the relevant grooming sections and just simple
 * details of the dogs unless hover over to see all warnings & pet codes."
 *
 * The twelve workflow states fold into six areas. A dog WAITING for the bath
 * is in the bath area, shown as waiting; the board's own stage names still
 * carry the detail on the card.
 */
export type KanbanColumnKey = "arriving" | "bath" | "dry" | "wait_groom" | "groom" | "ready" | "out";

export type KanbanColumn = {
  key: KanbanColumnKey;
  label: string;
  /** The states that put a dog in this column, waiting first. */
  states: readonly string[];
  /** Dropping a card here moves the dog to this state. */
  dropState: string;
};

export const KANBAN_COLUMNS: readonly KanbanColumn[] = [
  { key: "arriving", label: "Arriving", states: ["scheduled"], dropState: "scheduled" },
  { key: "bath", label: "Bath", states: ["checked_in", "waiting_for_bath", "bathing"], dropState: "bathing" },
  { key: "dry", label: "Dry", states: ["waiting_for_dry", "drying"], dropState: "drying" },
  /*
   * Waiting for a groomer is its own area. Lauren, 24/11/2026: "I recommend
   * the wait to groom area to show up instead of just groom status." Dogs
   * dried and waiting sat in Groom beside the dog on the table, told apart
   * only by a status pill; the queue for the groomers is the thing the
   * front desk most wants to see at a glance.
   */
  { key: "wait_groom", label: "Wait to groom", states: ["waiting_for_groom"], dropState: "waiting_for_groom" },
  { key: "groom", label: "Groom", states: ["grooming"], dropState: "grooming" },
  { key: "ready", label: "Ready", states: ["ready"], dropState: "ready" },
  { key: "out", label: "Out", states: ["complete"], dropState: "complete" },
] as const;

/** Which column a dog's card sits in. Cancelled and no-show dogs have none. */
export function kanbanColumnFor(workflowState: string): KanbanColumnKey | null {
  return KANBAN_COLUMNS.find((c) => c.states.includes(workflowState))?.key ?? null;
}

/** A dog in its area but not being worked on yet: checked in, or waiting. */
export function isWaitingInColumn(workflowState: string): boolean {
  return workflowState === "checked_in" || workflowState.startsWith("waiting_for_");
}

type CardRow = { id: number; workflowState: string; scheduledStart: Date | string | number };

/**
 * The day's dogs grouped by column. Within a column the dogs being worked on
 * come first, then the ones waiting, each in booking order, so the card at
 * the top of a column is the one in somebody's hands.
 */
export function groupIntoKanbanColumns<T extends CardRow>(
  rows: readonly T[],
  options: { showOut: boolean },
): Array<{ column: KanbanColumn; rows: T[] }> {
  const time = (r: T) => new Date(r.scheduledStart).getTime();
  return KANBAN_COLUMNS
    .filter((column) => options.showOut || column.key !== "out")
    .map((column) => ({
      column,
      rows: rows
        .filter((r) => column.states.includes(r.workflowState))
        .sort((a, b) =>
          Number(isWaitingInColumn(a.workflowState)) - Number(isWaitingInColumn(b.workflowState))
          || time(a) - time(b)
          || a.id - b.id),
    }));
}
