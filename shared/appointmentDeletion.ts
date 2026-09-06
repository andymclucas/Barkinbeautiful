export function resolveAppointmentDeletionIds(
  appointmentId: number,
  sessionId: string | null,
  sessionAppointmentIds: number[],
) {
  if (!sessionId) return [appointmentId];

  return Array.from(new Set([appointmentId, ...sessionAppointmentIds]));
}
