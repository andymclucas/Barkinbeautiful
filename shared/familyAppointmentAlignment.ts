export type FamilySessionAppointment = {
  id: number;
  petFamilyGroupId: number | null;
  sessionId: string | null;
  scheduledStart: Date | string | number;
  scheduledEnd: Date | string | number;
  status: string;
  workflowState?: string;
};

export type FamilyAppointmentTimeAlignment = {
  appointmentId: number;
  scheduledStart: Date;
  scheduledEnd: Date;
};

function timestamp(value: Date | string | number) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Aligns future, non-terminal appointments for a family only when the bookings
 * already belong to the same shared session. Historical and completed workflow
 * records are deliberately left untouched.
 */
export function getFamilySessionTimeAlignments(
  appointments: FamilySessionAppointment[],
  now = Date.now(),
): FamilyAppointmentTimeAlignment[] {
  const groups = new Map<string, Array<FamilySessionAppointment & { start: number; end: number }>>();
  for (const appointment of appointments) {
    if (!appointment.petFamilyGroupId || !appointment.sessionId?.trim()) continue;
    if (appointment.status === "cancelled" || appointment.status === "no_show") continue;
    if (appointment.workflowState === "complete" || appointment.workflowState === "cancelled" || appointment.workflowState === "no_show") continue;
    const start = timestamp(appointment.scheduledStart);
    const end = timestamp(appointment.scheduledEnd);
    if (start === null || end === null || end < start) continue;
    const key = `${appointment.petFamilyGroupId}:${appointment.sessionId.trim()}`;
    const group = groups.get(key) ?? [];
    group.push({ ...appointment, start, end });
    groups.set(key, group);
  }

  const alignments: FamilyAppointmentTimeAlignment[] = [];
  Array.from(groups.values()).forEach(group => {
    if (group.length < 2) return;
    const anchorStart = Math.min(...group.map(appointment => appointment.start));
    group.forEach(appointment => {
      if (appointment.start < now || appointment.start === anchorStart) return;
      alignments.push({
        appointmentId: appointment.id,
        scheduledStart: new Date(anchorStart),
        scheduledEnd: new Date(anchorStart + (appointment.end - appointment.start)),
      });
    });
  });
  return alignments;
}
