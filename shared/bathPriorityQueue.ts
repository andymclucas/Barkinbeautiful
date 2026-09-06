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
  priority: BathPriorityValue;
  rows: T[];
  petNames: string[];
  scheduledStart: T["scheduledStart"];
  isCoordinatedBooking: boolean;
};

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
        rows: group.sort((left, right) => left.id - right.id),
        petNames,
        scheduledStart: first.scheduledStart,
        isCoordinatedBooking: group.length > 1,
      };
    })
    .sort((left, right) => left.priority - right.priority
      || (left.rows[0]!.bathQueueOrder ?? Number.MAX_SAFE_INTEGER) - (right.rows[0]!.bathQueueOrder ?? Number.MAX_SAFE_INTEGER)
      || scheduledTimestamp(left.scheduledStart) - scheduledTimestamp(right.scheduledStart)
      || left.rows[0]!.id - right.rows[0]!.id);
}
