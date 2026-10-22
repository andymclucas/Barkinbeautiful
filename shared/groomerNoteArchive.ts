/**
 * Every note a groomer has written on a dog, newest first.
 *
 * Andy, 22/10/2026: "Ensure groomers notes carry over into the dogs
 * (clients) card. Not for client to be able to view in their portal,
 * just for groomers reference that they have an archive of all notes
 * from each appointment."
 *
 * The notes already existed — one per appointment, typed in the booking
 * dialog ("very matted in ears, had to demat for a while and shave chest
 * and belly shorter"). What was missing is that reading them back meant
 * opening appointments one at a time, so in practice nobody did, and the
 * groomer who had Waffle last time could not tell the one who has him
 * today what happened.
 *
 * **Staff-only, by omission rather than by a flag.** The client portal
 * payload (`buildClientPortalPayload`) does not select
 * `appointments.notes` at all, so there is nothing to hide — the notes
 * have never left the staff app. That is the safer shape than a
 * `visibleToClient` column somebody could flip by accident, and it is
 * why there is a test below pinning the portal's column list.
 */

export type ArchivableAppointment = {
  id: number;
  petId: number | null;
  scheduledStart: Date | string;
  notes?: string | null;
  staffName?: string | null;
  serviceType?: string | null;
};

export type ArchivedNote = {
  appointmentId: number;
  /** The appointment's start, for "22 Oct 2026". */
  when: Date;
  note: string;
  groomer: string | null;
  serviceType: string | null;
};

/**
 * One dog's notes, newest first.
 *
 * Skips appointments with no note rather than listing empty rows: a
 * groom where nothing unusual happened is the common case, and padding
 * the archive with blanks is what makes people stop scrolling it.
 */
export function noteArchiveForPet(
  appointments: readonly ArchivableAppointment[],
  petId: number,
): ArchivedNote[] {
  return appointments
    .filter((a) => a.petId === petId)
    .map((a) => {
      const note = String(a.notes ?? "").trim();
      if (!note) return null;
      const when = a.scheduledStart instanceof Date ? a.scheduledStart : new Date(a.scheduledStart);
      if (Number.isNaN(when.getTime())) return null;
      return {
        appointmentId: a.id,
        when,
        note,
        groomer: String(a.staffName ?? "").trim() || null,
        serviceType: a.serviceType ?? null,
      };
    })
    .filter((n): n is ArchivedNote => n !== null)
    .sort((a, b) => b.when.getTime() - a.when.getTime());
}

/** How many dogs on this client have any notes at all. */
export function petsWithNotes(
  appointments: readonly ArchivableAppointment[],
): Set<number> {
  const ids = new Set<number>();
  for (const a of appointments) {
    if (a.petId !== null && String(a.notes ?? "").trim()) ids.add(a.petId);
  }
  return ids;
}
