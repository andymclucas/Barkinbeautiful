export const BATH_PRIORITY_VALUES = [1, 2, 3, 4, 5] as const;

export type BathPriorityValue = typeof BATH_PRIORITY_VALUES[number];

export const BATH_PRIORITY_META: Record<BathPriorityValue, { label: string; colour: string; softColour: string }> = {
  1: { label: "Next", colour: "#e11d48", softColour: "#fff1f2" },
  2: { label: "After next", colour: "#ea580c", softColour: "#fff7ed" },
  3: { label: "Third", colour: "#ca8a04", softColour: "#fefce8" },
  4: { label: "Fourth", colour: "#0284c7", softColour: "#f0f9ff" },
  5: { label: "Fifth", colour: "#7c3aed", softColour: "#f5f3ff" },
};

export type BathPriorityQueueRow = {
  id: number;
  bathPriority: number | null | undefined;
  petName: string | null | undefined;
  scheduledStart: Date | string | number;
  sessionId?: string | null;
  petFamilyGroupId?: number | null;
  bathGroupId?: string | null;
  bathQueueOrder?: number | null;
  workflowState: string;
};

export type BathPriorityQueueItem<T extends BathPriorityQueueRow> = {
  /** What staff set, 1–5. The intent, which does not move on its own. */
  priority: BathPriorityValue;
  /**
   * Where this actually sits in the queue right now, counting from 1.
   *
   * Lauren, 13/10/2026: "I would like to see it auto update the numbers
   * for the bathing... so 1 then moves down the line and updates the
   * others like a countdown on baths."
   *
   * Derived, never stored. Bathe the dog at the top and it leaves the
   * queue, so everything behind it shifts up on the next refresh with
   * nothing written and no two staff members racing each other. It also
   * gives a total order where the stored priority does not: two separate
   * cohorts can both be a 1, and both showing "1" tells a bather nothing
   * about which to pick up.
   */
  position: number;
  rows: T[];
  petNames: string[];
  scheduledStart: T["scheduledStart"];
  isCoordinatedBooking: boolean;
};

/**
 * The label and colour for a queue position.
 *
 * Positions beyond the fifth are possible — the stored priority is capped
 * at 5, but several cohorts can share one, so a busy morning can run
 * deeper than the colours do. Those get a plain ordinal and a neutral
 * slate, rather than wrapping round and giving a sixth dog the same red
 * as the one actually going next.
 */
export function bathQueuePositionMeta(position: number): { label: string; colour: string; softColour: string } {
  const known = BATH_PRIORITY_META[position as BathPriorityValue];
  if (known) return known;
  return { label: `${position}th in line`, colour: "#475569", softColour: "#f8fafc" };
}

const BATH_QUEUE_STATES = new Set(["scheduled", "checked_in", "waiting_for_bath", "bathing"]);

export function isBathPriorityEligible(workflowState: string) {
  return BATH_QUEUE_STATES.has(workflowState);
}

export function isBathPriorityMutable(workflowState: string) {
  return workflowState !== "complete" && workflowState !== "cancelled" && workflowState !== "no_show";
}

function priorityValue(value: number | null | undefined): BathPriorityValue | null {
  return BATH_PRIORITY_VALUES.includes(value as BathPriorityValue) ? value as BathPriorityValue : null;
}

function scheduledTimestamp(value: BathPriorityQueueRow["scheduledStart"]) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function queueCohortKey(row: BathPriorityQueueRow) {
  if (row.bathGroupId?.trim()) return `bath-group-${row.bathGroupId.trim()}`;
  if (row.sessionId?.trim()) return `session-${row.sessionId.trim()}`;
  if (row.petFamilyGroupId) return `family-${row.petFamilyGroupId}-${scheduledTimestamp(row.scheduledStart)}`;
  return `appointment-${row.id}`;
}

/**
 * Builds a separate bathing queue without changing the normal workflow order.
 * Same-session dogs and same-time family-linked dogs share one queue item.
 */
export function buildBathPriorityQueue<T extends BathPriorityQueueRow>(rows: T[]): BathPriorityQueueItem<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const priority = priorityValue(row.bathPriority);
    if (!priority || !isBathPriorityEligible(row.workflowState)) continue;
    const key = `${priority}:${queueCohortKey(row)}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => {
      const first = group[0]!;
      const priority = priorityValue(first.bathPriority)!;
      const petNames = Array.from(new Set(group.map((row) => row.petName?.trim()).filter((name): name is string => Boolean(name))));
      return {
        priority,
        // Filled in once the whole queue is ordered, below.
        position: 0,
        rows: group.sort((left, right) => left.id - right.id),
        petNames,
        scheduledStart: first.scheduledStart,
        isCoordinatedBooking: group.length > 1,
      };
    })
    .sort((left, right) => left.priority - right.priority
      || (left.rows[0]!.bathQueueOrder ?? Number.MAX_SAFE_INTEGER) - (right.rows[0]!.bathQueueOrder ?? Number.MAX_SAFE_INTEGER)
      || scheduledTimestamp(left.scheduledStart) - scheduledTimestamp(right.scheduledStart)
      || left.rows[0]!.id - right.rows[0]!.id)
    // Numbered after sorting, so the top of the list is always 1 whatever
    // the stored priorities happen to be. Dogs together in one coordinated
    // booking are one item and so share a position — they go in together.
    .map((item, index) => ({ ...item, position: index + 1 }));
}
