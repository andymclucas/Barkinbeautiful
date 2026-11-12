export function resolveAppointmentDeletionIds(
  appointmentId: number,
  sessionId: string | null,
  sessionAppointmentIds: number[],
  /**
   * Delete just this dog and leave the rest of the booking. Used by the
   * client's Bookings tab, where each row IS one dog — see
   * shared/familyBookingRows.ts.
   */
  onlyThisDog = false,
) {
  if (!sessionId || onlyThisDog) return [appointmentId];

  return Array.from(new Set([appointmentId, ...sessionAppointmentIds]));
}
