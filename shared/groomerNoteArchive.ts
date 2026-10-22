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

/**
 * A style note: how the dog was cut, rather than what happened.
 *
 * Keyed to the PET, not the appointment — `groom_style_notes.appointment_id`
 * is nullable and is deliberately cleared when a booking is deleted, so
 * going via appointments would drop the history of every cancelled
 * groom. That is exactly the history worth keeping.
 */
export type ArchivableStyleNote = {
  id: number;
  petId: number;
  createdAt: Date | string;
  note?: string | null;
  warnings?: string | null;
  serviceType?: string | null;
  bladeSize?: string | null;
  combSize?: string | null;
  bodyLength?: string | null;
  headStyle?: string | null;
  faceStyle?: string | null;
  earStyle?: string | null;
  legStyle?: string | null;
  tailStyle?: string | null;
  staffName?: string | null;
};

export type ArchivedNote = {
  /** Distinguishes "what happened" from "how it was cut". */
  kind: "appointment" | "style";
  /** Unique within the merged list: the kind plus the row id. */
  key: string;
  when: Date;
  note: string;
  groomer: string | null;
  serviceType: string | null;
  /** Style notes only: "Blade #4 · Teddy bear face · Rounded feet". */
  styleSummary?: string | null;
  /** Style notes only: whatever the groomer flagged as a warning. */
  warnings?: string | null;
};

/**
 * The styling fields as one readable line.
 *
 * Labelled, because "#4 · Short · Round" out of context tells a groomer
 * nothing about which part of the dog each applies to.
 */
export function describeStyle(note: ArchivableStyleNote): string {
  const parts: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    const v = String(value ?? "").trim();
    if (v) parts.push(`${label} ${v}`);
  };
  add("Blade", note.bladeSize);
  add("Comb", note.combSize);
  add("Body", note.bodyLength);
  add("Head", note.headStyle);
  add("Face", note.faceStyle);
  add("Ears", note.earStyle);
  add("Legs", note.legStyle);
  add("Tail", note.tailStyle);
  return parts.join(" · ");
}

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
  styleNotes: readonly ArchivableStyleNote[] = [],
): ArchivedNote[] {
  const toDate = (value: Date | string): Date | null => {
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const fromAppointments = appointments
    .filter((a) => a.petId === petId)
    .map((a): ArchivedNote | null => {
      const note = String(a.notes ?? "").trim();
      const when = toDate(a.scheduledStart);
      if (!note || !when) return null;
      return {
        kind: "appointment",
        key: `appointment:${a.id}`,
        when,
        note,
        groomer: String(a.staffName ?? "").trim() || null,
        serviceType: a.serviceType ?? null,
      };
    });

  const fromStyle = styleNotes
    .filter((n) => n.petId === petId)
    .map((n): ArchivedNote | null => {
      const when = toDate(n.createdAt);
      if (!when) return null;
      const note = String(n.note ?? "").trim();
      const styleSummary = describeStyle(n) || null;
      const warnings = String(n.warnings ?? "").trim() || null;
      // A row with no text in any of the three is a draft nobody filled
      // in; listing it as a blank card is what makes the archive
      // unreadable.
      if (!note && !styleSummary && !warnings) return null;
      return {
        kind: "style",
        key: `style:${n.id}`,
        when,
        note,
        groomer: String(n.staffName ?? "").trim() || null,
        serviceType: n.serviceType ?? null,
        styleSummary,
        warnings,
      };
    });

  return [...fromAppointments, ...fromStyle]
    .filter((n): n is ArchivedNote => n !== null)
    // Newest first. The tie-break keeps the order stable when a style
    // note and the groom it describes share a timestamp, so the list
    // does not reshuffle between renders.
    .sort((a, b) => b.when.getTime() - a.when.getTime() || a.key.localeCompare(b.key));
}

/** How many dogs on this client have anything written about them at all. */
export function petsWithNotes(
  appointments: readonly ArchivableAppointment[],
  styleNotes: readonly ArchivableStyleNote[] = [],
): Set<number> {
  const ids = new Set<number>();
  for (const a of appointments) {
    if (a.petId !== null && String(a.notes ?? "").trim()) ids.add(a.petId);
  }
  for (const n of styleNotes) {
    if (String(n.note ?? "").trim() || String(n.warnings ?? "").trim() || describeStyle(n)) ids.add(n.petId);
  }
  return ids;
}
