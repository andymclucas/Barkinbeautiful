/**
 * Which fields a reschedule writes.
 *
 * Pulled out because of a trap in the obvious spelling. `reschedule` used
 * to set `staffId: input.staffId ?? null`, so a caller that only wanted to
 * move a booking in TIME — and so sent no staff id — silently unassigned
 * the dog. The calendar never hit it, because its edit dialog and its drag
 * handler both always send a staff id. The first caller that did not was
 * the client record's "change booking time", added 28/10/2026, and it
 * would have taken Poppy off Charlotte while fixing her time.
 *
 * So: omitted means LEAVE IT ALONE, null means UNASSIGN. That is the same
 * contract `updateDetails` uses for price and contact, right below it.
 */
export function buildRescheduleUpdate(input: {
  scheduledStart: Date;
  scheduledEnd: Date;
  staffId?: number | null;
}): { scheduledStart: Date; scheduledEnd: Date; staffId?: number | null } {
  const update: { scheduledStart: Date; scheduledEnd: Date; staffId?: number | null } = {
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd,
  };
  if (input.staffId !== undefined) update.staffId = input.staffId;
  return update;
}
