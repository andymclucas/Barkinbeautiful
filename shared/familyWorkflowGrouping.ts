export type FamilyWorkflowRow = {
  id: number;
  scheduledStart: Date | string | number;
  petFamilyGroupId?: number | null;
  sessionId?: string | null;
};

function scheduledTimestamp(value: FamilyWorkflowRow["scheduledStart"]) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

/**
 * Groups visible family-linked pets as a single Workflow cohort. The cohort is
 * anchored to its earliest recorded appointment, while every row retains its
 * own original scheduled time and appointment data.
 *
 * Two dogs of the same family belong together when they share a booking
 * session, OR when they are booked for the same moment. A family may still
 * have genuinely separate bookings on the same day — a dog at 8am and another
 * at 6pm, with no booking in common — and those stay apart.
 *
 * Those two rules COMPOSE, which is the part that used to be missing. The key
 * was built as "session if there is one, otherwise time", so a dog with a
 * session and a dog without could never match even when booked for the same
 * minute. On 09/10/2026 the three Phillips schnauzers were all family 630007
 * and all at 8:00am, but Trinnie and Pheobe shared a booking session and Zelda
 * did not — so Zelda sorted on her own and an unrelated dog sat between them
 * on the board.
 *
 * Connecting the rows and then taking connected components makes the rules
 * transitive, so linking dogs together is enough to bring them together on the
 * board however they were booked.
 */
export function groupFamilyWorkflowRows<T extends FamilyWorkflowRow>(rows: T[]): T[] {
  // Union-find over row indices. Only rows carrying a family id take part;
  // everything else keeps its own place.
  const parent = new Map<number, number>();
  const find = (index: number): number => {
    let root = index;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression, so a long family chain stays cheap.
    let walk = index;
    while (parent.get(walk) !== root) {
      const next = parent.get(walk)!;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const familyIndices: number[] = [];
  rows.forEach((row, index) => {
    if (!row.petFamilyGroupId) return;
    parent.set(index, index);
    familyIndices.push(index);
  });

  // Connect by shared booking session, then by identical scheduled time.
  // Running both passes over the same structure is what makes them compose.
  const bySession = new Map<string, number>();
  const byTime = new Map<string, number>();
  for (const index of familyIndices) {
    const row = rows[index];
    const family = row.petFamilyGroupId;
    const session = row.sessionId?.trim();
    if (session) {
      const key = `${family}-session-${session}`;
      const seen = bySession.get(key);
      if (seen === undefined) bySession.set(key, index);
      else union(seen, index);
    }
    const timeKey = `${family}-time-${scheduledTimestamp(row.scheduledStart)}`;
    const seenAt = byTime.get(timeKey);
    if (seenAt === undefined) byTime.set(timeKey, index);
    else union(seenAt, index);
  }

  // A cohort needs at least two visible dogs; a lone family member is just a
  // row and must not be pulled out of time order.
  const membersByRoot = new Map<number, number[]>();
  for (const index of familyIndices) {
    const root = find(index);
    const members = membersByRoot.get(root) ?? [];
    members.push(index);
    membersByRoot.set(root, members);
  }
  const anchorByRoot = new Map<number, number>();
  membersByRoot.forEach((members, root) => {
    if (members.length < 2) return;
    anchorByRoot.set(root, Math.min(...members.map((index) => scheduledTimestamp(rows[index].scheduledStart))));
  });

  return rows
    .map((row, originalIndex) => {
      const root = row.petFamilyGroupId ? find(originalIndex) : null;
      const inCohort = root !== null && anchorByRoot.has(root);
      return {
        row,
        originalIndex,
        scheduledAt: scheduledTimestamp(row.scheduledStart),
        anchorAt: inCohort ? anchorByRoot.get(root!)! : scheduledTimestamp(row.scheduledStart),
        cohortKey: inCohort ? `family-${row.petFamilyGroupId}-${root}` : `appointment-${row.id}`,
      };
    })
    .sort((left, right) => {
      if (left.anchorAt !== right.anchorAt) return left.anchorAt - right.anchorAt;
      if (left.cohortKey !== right.cohortKey) return left.cohortKey.localeCompare(right.cohortKey);
      if (left.scheduledAt !== right.scheduledAt) return left.scheduledAt - right.scheduledAt;
      return left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.row);
}
