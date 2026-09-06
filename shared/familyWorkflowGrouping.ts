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
 */
export function groupFamilyWorkflowRows<T extends FamilyWorkflowRow>(rows: T[]): T[] {
  const membersByCohort = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.petFamilyGroupId) continue;
    // A family may have separate bookings on the same day. Only a shared
    // booking session, or an identical scheduled time, is one Workflow cohort.
    const appointmentKey = row.sessionId?.trim()
      ? `session-${row.sessionId.trim()}`
      : `time-${scheduledTimestamp(row.scheduledStart)}`;
    const cohortKey = `family-${row.petFamilyGroupId}-${appointmentKey}`;
    const cohortMembers = membersByCohort.get(cohortKey) ?? [];
    cohortMembers.push(row);
    membersByCohort.set(cohortKey, cohortMembers);
  }

  const cohortAnchorByKey = new Map<string, number>();
  Array.from(membersByCohort.entries()).forEach(([cohortKey, cohortMembers]) => {
    if (cohortMembers.length < 2) return;
    cohortAnchorByKey.set(cohortKey, Math.min(...cohortMembers.map((member: T) => scheduledTimestamp(member.scheduledStart))));
  });

  return rows
    .map((row, originalIndex) => {
      const familyId = row.petFamilyGroupId;
      const appointmentKey = row.sessionId?.trim()
        ? `session-${row.sessionId.trim()}`
        : `time-${scheduledTimestamp(row.scheduledStart)}`;
      const familyCohortKey = familyId !== null && familyId !== undefined ? `family-${familyId}-${appointmentKey}` : null;
      const isVisibleFamilyCohort = familyCohortKey !== null && cohortAnchorByKey.has(familyCohortKey);
      return {
        row,
        originalIndex,
        scheduledAt: scheduledTimestamp(row.scheduledStart),
        anchorAt: isVisibleFamilyCohort ? cohortAnchorByKey.get(familyCohortKey!)! : scheduledTimestamp(row.scheduledStart),
        cohortKey: isVisibleFamilyCohort ? familyCohortKey! : `appointment-${row.id}`,
      };
    })
    .sort((left, right) => {
      if (left.anchorAt !== right.anchorAt) return left.anchorAt - right.anchorAt;
      if (left.cohortKey !== right.cohortKey) return left.cohortKey.localeCompare(right.cohortKey);
      if (left.scheduledAt !== right.scheduledAt) return left.scheduledAt - right.scheduledAt;
      return left.originalIndex - right.originalIndex;
    })
    .map(entry => entry.row);
}
