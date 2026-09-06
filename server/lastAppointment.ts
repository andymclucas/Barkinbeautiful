export type PriorAppointmentCandidate = {
  petId: number | null;
  scheduledStart: Date;
  status: string;
};

/**
 * Calendar history should surface the most recent real visit only. The query
 * arrives newest-first, and cancelled/no-show placeholders are deliberately
 * ignored so they never replace the pet's last actual appointment.
 */
export function resolveLastAppointmentDates(rows: PriorAppointmentCandidate[]): Record<number, Date> {
  const dates: Record<number, Date> = {};
  for (const row of rows) {
    if (row.petId === null || dates[row.petId]) continue;
    if (row.status === "cancelled" || row.status === "no_show") continue;
    dates[row.petId] = row.scheduledStart;
  }
  return dates;
}
