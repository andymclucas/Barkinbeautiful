/**
 * The dogs on one booking, each carrying its own facts.
 *
 * Andy, 09/11/2026, with MoeGo's booking panel beside Groomigo's: "the
 * pets are not very noticeable as you can see the MoeGo card has more
 * details of the pets and they are clickable."
 *
 * ## The codes were the part that was actually wrong
 *
 * `pets.moego_code_labels` is per DOG — "Style C", "DONT PLUCK EARS",
 * "#19mm" — and the panel rendered the LEAD appointment's, once, under
 * the client's name. On a two-dog booking that attributes one dog's
 * warnings to both, or drops them, depending which dog happens to lead.
 *
 * On the booking Andy was looking at, MoeGo shows DONT PLUCK EARS
 * against Mickey and nothing against Tilly. Groomigo showed one set for
 * the pair. A groomer reading that either plucks Mickey's ears or does
 * not pluck Tilly's — and only one of those is recoverable.
 *
 * So this exists to make "which dog does this belong to" a question with
 * one answer, testable without a database or a browser. The panel maps
 * over what comes back; it does not reach past a row for anything.
 *
 * ## Order
 *
 * The lead first, then the siblings as given. The lead is the row the
 * panel was opened from, so it is the dog the person clicked, and moving
 * it would be its own small confusion.
 */

/** One appointment row, as much of it as a dog's summary needs. */
export type BookingPetInput = {
  /** The APPOINTMENT id — one per dog, and what the report status keys on. */
  id: number;
  petId: number;
  clientId: number;
  petName: string | null;
  petBreed: string | null;
  /** This dog's codes, as stored. Never the booking's. */
  petMoegoCodeLabels: string | null;
  lastAppointmentDate?: Date | string | null;
};

export type BookingPetRow = {
  appointmentId: number;
  petId: number;
  name: string;
  /** Null when there is nothing on file, so the caller can say so. */
  breed: string | null;
  codes: string | null;
  lastVisit: Date | null;
  /** Where the dog's own record lives. */
  href: string;
};

/**
 * Every dog on the booking, deduplicated by appointment id.
 *
 * The dedupe is not theoretical: the panel builds its list as
 * `[editAppt, ...editSiblings]`, and a sibling query that ever included
 * the lead would render that dog twice — once with its codes and once
 * with the same codes, which reads as two dogs with identical warnings.
 */
export function bookingPetRows(
  lead: BookingPetInput,
  siblings: readonly BookingPetInput[],
): BookingPetRow[] {
  const seen = new Set<number>();
  const out: BookingPetRow[] = [];
  for (const row of [lead, ...siblings]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const last = row.lastAppointmentDate ? new Date(row.lastAppointmentDate) : null;
    const breed = (row.petBreed ?? "").trim();
    out.push({
      appointmentId: row.id,
      petId: row.petId,
      name: (row.petName ?? "").trim() || "This dog",
      breed: breed === "" ? null : breed,
      codes: row.petMoegoCodeLabels,
      lastVisit: last && Number.isFinite(last.getTime()) ? last : null,
      /* ClientDetail already reads `?pet=` and opens on that dog,
         scrolled to and ringed. There is no route for a pet of its
         own — this page is the only thing that holds one. */
      href: `/clients/${row.clientId}?pet=${row.petId}`,
    });
  }
  return out;
}
