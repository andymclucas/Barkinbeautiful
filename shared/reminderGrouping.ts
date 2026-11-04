/**
 * One reminder per BOOKING, not per dog.
 *
 * Andy, on the pickup text: "Only send the one message to the client
 * when all dogs in the family are ready on the workflow board. Do not
 * ever send 2 or 3."
 *
 * The pickup text obeys that (shared/pickupGroup.ts) and so does the
 * booking confirmation, which says so in its own comment — "One
 * booking, one text, however many dogs are on it." The reminder was the
 * last of the three still looping over appointment ROWS, and Groomigo
 * stores one row per dog. A client with three dogs booked at 12:30 got
 * three separate texts, each naming one dog.
 *
 * Measured on 04/11/2026, before turning reminders on: 34 texts to 26
 * clients on the very first run, and 294 duplicates over the following
 * thirty days across the three stages. That is the kind of thing a
 * client remembers about a salon.
 *
 * ## Why the key is (client, start) and not the session
 *
 * `session_id` is the obvious key and it is not enough. It is NULL on
 * MoeGo imports, which is nearly every upcoming booking, so grouping on
 * it would have left the duplicates in place exactly where they are
 * commonest. It can also differ for what the client experiences as one
 * visit — two dogs of one household landed in two sessions on
 * 09/10/2026 and the calendar drew them as two bookings.
 *
 * The client's own view settles it: same person, same time, one trip,
 * one text.
 */

export type RemindableAppointment = {
  appointmentId: number;
  clientId: number;
  scheduledStart: Date | string | number;
  petName?: string | null;
};

export type ReminderGroup<T> = {
  /** Every row the text covers. ALL of them must be claimed. */
  appointments: T[];
  /** Named in the order they were given, blanks dropped. */
  petNames: string[];
  /** The row whose client, time and groomer the message is built from. */
  lead: T;
};

function startKey(when: Date | string | number): string {
  const d = when instanceof Date ? when : new Date(when);
  const t = d.getTime();
  // An unreadable time groups with nothing rather than collapsing every
  // broken row of the day into one text naming all of them.
  return Number.isNaN(t) ? `invalid:${Math.random()}` : String(t);
}

/**
 * One group per (client, start), in the order the first row of each
 * group appeared. Stable, so a run sends in the same order it reads.
 */
export function groupRemindersByBooking<T extends RemindableAppointment>(
  rows: readonly T[],
): ReminderGroup<T>[] {
  const groups = new Map<string, ReminderGroup<T>>();
  for (const row of rows) {
    const key = `${row.clientId}|${startKey(row.scheduledStart)}`;
    const existing = groups.get(key);
    const name = (row.petName ?? "").trim();
    if (existing) {
      existing.appointments.push(row);
      if (name) existing.petNames.push(name);
    } else {
      groups.set(key, { appointments: [row], petNames: name ? [name] : [], lead: row });
    }
  }
  return [...groups.values()];
}
