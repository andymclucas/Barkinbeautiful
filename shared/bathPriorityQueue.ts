export const BATH_PRIORITY_VALUES = [1, 2, 3, 4, 5] as const;

export type BathPriorityValue = (typeof BATH_PRIORITY_VALUES)[number];

export const BATH_PRIORITY_META: Record<
  BathPriorityValue,
  { label: string; colour: string; softColour: string }
> = {
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
export function bathQueuePositionMeta(position: number): {
  label: string;
  colour: string;
  softColour: string;
} {
  const known = BATH_PRIORITY_META[position as BathPriorityValue];
  if (known) return known;
  return {
    label: `${position}th in line`,
    colour: "#475569",
    softColour: "#f8fafc",
  };
}

const BATH_QUEUE_STATES = new Set([
  "scheduled",
  "checked_in",
  "waiting_for_bath",
  "bathing",
]);

export function isBathPriorityEligible(workflowState: string) {
  return BATH_QUEUE_STATES.has(workflowState);
}

/**
 * Who may change the bath order: the priority numbers, the bath groups
 * and the order of the queue.
 *
 * Lauren, 13/11/2026: "can we stop the bathers having access to changing
 * the priority bath numbers... they changed the numbers we put in then
 * missed Teddy who came in at 8am." The numbers are how the groomers
 * tell the bath team what they need next, so the bath team following
 * them is the point; the bath team rewriting them defeats it.
 *
 * Decided by the salon role on the staff record, not the login's
 * platform role. Everyone else, including a login with no staff record
 * at all (the owners' admin accounts), may still set it.
 */
export function canChangeBathOrder(staffRole: string | null | undefined): boolean {
  return staffRole !== "bather";
}

export const BATH_ORDER_LOCKED_MESSAGE =
  "The bath order is set by the groomers. Ask a groomer or the front desk to change it.";

export function isBathPriorityMutable(workflowState: string) {
  return (
    workflowState !== "complete" &&
    workflowState !== "cancelled" &&
    workflowState !== "no_show"
  );
}

function priorityValue(
  value: number | null | undefined
): BathPriorityValue | null {
  return BATH_PRIORITY_VALUES.includes(value as BathPriorityValue)
    ? (value as BathPriorityValue)
    : null;
}

function scheduledTimestamp(value: BathPriorityQueueRow["scheduledStart"]) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function queueCohortKey(row: BathPriorityQueueRow) {
  if (row.bathGroupId?.trim()) return `bath-group-${row.bathGroupId.trim()}`;
  if (row.sessionId?.trim()) return `session-${row.sessionId.trim()}`;
  if (row.petFamilyGroupId)
    return `family-${row.petFamilyGroupId}-${scheduledTimestamp(row.scheduledStart)}`;
  return `appointment-${row.id}`;
}

/**
 * Builds a separate bathing queue without changing the normal workflow order.
 * Same-session dogs and same-time family-linked dogs share one queue item.
 */
export function buildBathPriorityQueue<T extends BathPriorityQueueRow>(
  rows: T[]
): BathPriorityQueueItem<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const priority = priorityValue(row.bathPriority);
    if (!priority || !isBathPriorityEligible(row.workflowState)) continue;
    const key = `${priority}:${queueCohortKey(row)}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return (
    Array.from(groups.values())
      .map(group => {
        const first = group[0]!;
        const priority = priorityValue(first.bathPriority)!;
        const petNames = Array.from(
          new Set(
            group
              .map(row => row.petName?.trim())
              .filter((name): name is string => Boolean(name))
          )
        );
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
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          (left.rows[0]!.bathQueueOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.rows[0]!.bathQueueOrder ?? Number.MAX_SAFE_INTEGER) ||
          scheduledTimestamp(left.scheduledStart) -
            scheduledTimestamp(right.scheduledStart) ||
          left.rows[0]!.id - right.rows[0]!.id
      )
      // Numbered after sorting, so the top of the list is always 1 whatever
      // the stored priorities happen to be. Dogs together in one coordinated
      // booking are one item and so share a position — they go in together.
      .map((item, index) => ({ ...item, position: index + 1 }))
  );
}

/**
 * The cohort a dog bathes in: the group staff made, else its booking,
 * else its family at that time, else itself.
 *
 * Exported so the board can ask "are these two already going in
 * together?" with the same key the queue is built from. Two answers to
 * that question would eventually disagree, and the one that disagreed
 * would offer to group dogs that are already grouped.
 */
export function bathCohortKey(row: BathPriorityQueueRow): string {
  return queueCohortKey(row);
}

/**
 * The other dogs now sharing this dog's bath number, that are not
 * already going in with it.
 *
 * Andy, 10/11/2026: "Some dogs can be bathed together - so if they are
 * assigned the same priority number give the option to say 'bath these
 * dogs together?' and tick yes or no."
 *
 * Two dogs on the same number is not the same as two dogs in the same
 * bath. The queue already copes — they become two items sharing a
 * priority, ordered behind one another — and that is right for two
 * strangers who happen to be next. It is wrong for two dogs that would
 * go in at once, and the only way to say so today is the Group dogs
 * dialog, which means leaving the number you just set and picking them
 * out of a list of the whole board.
 *
 * So the board asks at the moment the collision appears. Empty means
 * there is nothing to ask: nobody else is on that number, or everybody
 * else on it is already in this dog's cohort.
 *
 * Asked, never assumed — the same rule as the family check-in prompt.
 * Two dogs share a car far more often than they share a bath.
 */
export function dogsOnTheSameBathNumber<T extends BathPriorityQueueRow>(
  appointmentId: number,
  rows: readonly T[]
): T[] {
  const self = rows.find(row => row.id === appointmentId);
  if (!self) return [];
  const priority = priorityValue(self.bathPriority);
  if (!priority) return [];
  if (!isBathPriorityEligible(self.workflowState)) return [];

  const mine = queueCohortKey(self);
  return rows.filter(
    row =>
      row.id !== self.id &&
      priorityValue(row.bathPriority) === priority &&
      isBathPriorityEligible(row.workflowState) &&
      /* A dog already in the bath cannot be put in with another one, and
       offering it reads as though the board has lost track. */
      isBathPriorityMutable(row.workflowState) &&
      queueCohortKey(row) !== mine
  );
}

export type BathPriorityAnchor = {
  id: number;
  bathGroupId?: string | null;
  sessionId?: string | null;
  petFamilyGroupId?: number | null;
};

export type BathPriorityScope =
  | { kind: "alone"; appointmentId: number }
  | { kind: "bathGroup"; bathGroupId: string }
  | { kind: "session"; sessionId: string }
  | { kind: "family"; petFamilyGroupId: number };

/**
 * Which dogs a priority change should reach.
 *
 * Lauren, 30/10/2026: "I wanted bear & Abby to be bathed together cause
 * they are small.. but Abby & Ollie are family and it won't let me
 * in-group their bathing number. I wanted Ollie to be 3."
 *
 * Abby and Ollie are one family booked at one time, so the board treats
 * them as a single queue item and a change to either moved both. There
 * was no way to say "this dog only" — the board always asked for the
 * whole cohort.
 *
 * The order is deliberate and unchanged: an explicit bath group beats a
 * session, which beats the automatic same-time family cohort. What is
 * new is `alone`, for a dog being given a number of its own.
 */
export function bathPriorityScope(
  anchor: BathPriorityAnchor,
  applyToLinkedDogs: boolean
): BathPriorityScope {
  if (!applyToLinkedDogs) return { kind: "alone", appointmentId: anchor.id };
  if (anchor.bathGroupId?.trim())
    return { kind: "bathGroup", bathGroupId: anchor.bathGroupId.trim() };
  if (anchor.sessionId?.trim())
    return { kind: "session", sessionId: anchor.sessionId.trim() };
  if (anchor.petFamilyGroupId)
    return { kind: "family", petFamilyGroupId: anchor.petFamilyGroupId };
  return { kind: "alone", appointmentId: anchor.id };
}

/**
 * Whether a dog swept up by a SESSION or FAMILY change should actually
 * be changed.
 *
 * No, when it carries a bath group of its own. Putting Abby in a group
 * with Bear is an explicit instruction about Abby's bathing; a later
 * change to her brother Ollie — who is in no group, so the automatic
 * family rule applies to him — must not reach across and undo it.
 *
 * Without this the two halves of Lauren's request fight: grouping
 * Bear+Abby works, and then numbering Ollie silently pulls Abby back.
 */
export function bathPriorityChangeReaches(
  scope: BathPriorityScope,
  candidate: { id: number; bathGroupId?: string | null }
): boolean {
  if (scope.kind === "alone") return candidate.id === scope.appointmentId;
  if (scope.kind === "bathGroup") return true;
  return !candidate.bathGroupId?.trim();
}
