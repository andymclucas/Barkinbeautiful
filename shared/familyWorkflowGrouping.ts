export type FamilyWorkflowRow = {
  id: number;
  scheduledStart: Date | string | number;
  petFamilyGroupId?: number | null;
  /** Still carried by callers; no longer part of the grouping decision. */
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
 * Linking two dogs as family is the whole decision. Nothing else — not a
 * shared booking session, not a matching scheduled time — is required, and
 * nothing separates them once linked.
 *
 * It did not always work that way, and the history is worth keeping because
 * both earlier rules looked reasonable:
 *
 *   The key was once "session if there is one, otherwise time", so a dog with
 *   a booking session and a dog without could never match however identical
 *   their time. On 09/10/2026 that split the three Phillips schnauzers — all
 *   family 630007, all 8:00am — because two shared a booking and Zelda did
 *   not, and an unrelated dog sorted between them.
 *
 *   Making those two rules compose fixed that case but still left a family's
 *   separate bookings apart, on the reasoning that a morning dog and an
 *   evening dog should stay in time order.
 *
 * Andy, 09/10/2026: "make them group together regardless of time." A family
 * is handled as a family, so the board shows them as one. The trade is that a
 * dog booked for later in the day now appears beside its siblings rather than
 * at its own hour — intended, and the reason the cohort is anchored to the
 * EARLIEST of its appointments rather than scattering the group.
 *
 * A lone family dog is left exactly where its time puts it: a cohort needs at
 * least two dogs visible on the board to mean anything.
 */
export function groupFamilyWorkflowRows<T extends FamilyWorkflowRow>(rows: T[]): T[] {
  const membersByFamily = new Map<number, T[]>();
  for (const row of rows) {
    if (!row.petFamilyGroupId) continue;
    const members = membersByFamily.get(row.petFamilyGroupId) ?? [];
    members.push(row);
    membersByFamily.set(row.petFamilyGroupId, members);
  }

  const anchorByFamily = new Map<number, number>();
  membersByFamily.forEach((members, familyId) => {
    if (members.length < 2) return;
    anchorByFamily.set(familyId, Math.min(...members.map((member) => scheduledTimestamp(member.scheduledStart))));
  });

  return rows
    .map((row, originalIndex) => {
      const familyId = row.petFamilyGroupId ?? null;
      const inCohort = familyId !== null && anchorByFamily.has(familyId);
      return {
        row,
        originalIndex,
        scheduledAt: scheduledTimestamp(row.scheduledStart),
        anchorAt: inCohort ? anchorByFamily.get(familyId!)! : scheduledTimestamp(row.scheduledStart),
        cohortKey: inCohort ? `family-${familyId}` : `appointment-${row.id}`,
      };
    })
    .sort((left, right) => {
      if (left.anchorAt !== right.anchorAt) return left.anchorAt - right.anchorAt;
      if (left.cohortKey !== right.cohortKey) return left.cohortKey.localeCompare(right.cohortKey);
      // Inside a cohort the dogs keep their own running order.
      if (left.scheduledAt !== right.scheduledAt) return left.scheduledAt - right.scheduledAt;
      return left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.row);
}
