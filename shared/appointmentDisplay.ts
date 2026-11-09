export function formatSharedAppointmentName({
  petNames,
  surname,
}: {
  petNames: Array<string | null | undefined>;
  surname: string | null | undefined;
}): string {
  const names = petNames
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name));
  const cleanSurname = surname?.trim();
  return [names.join(" & "), cleanSurname].filter(Boolean).join(" ");
}

/**
 * What the Edit Appointment dialog is titled.
 *
 * The dog and the owner, not the words "Edit Appointment" — that is the one
 * thing on the screen a groomer already knows, and it was taking the bold
 * while the name it belongs to sat in small grey text beside it.
 *
 * Several pets fall back to the board's own wording ("Archie & George
 * Ketter") so the dialog and the card the user just clicked agree.
 */
export function formatAppointmentHeading({
  petNames,
  clientFirstName,
  clientLastName,
}: {
  petNames: Array<string | null | undefined>;
  clientFirstName?: string | null;
  clientLastName?: string | null;
}): string {
  const names = petNames
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name));

  if (names.length > 1) {
    return formatSharedAppointmentName({ petNames: names, surname: clientLastName });
  }

  const client = [clientFirstName?.trim(), clientLastName?.trim()].filter(Boolean).join(" ");

  // Never blank. A heading that disappears for a record with a missing name
  // is worse than a generic one, because the dialog then has no title at all.
  if (names.length === 0) return client ? `Appointment (${client})` : "Appointment";

  return client ? `${names[0]} (${client})` : names[0];
}

/**
 * How many of a family booking's dogs this card stands for.
 *
 * Andy, 09/11/2026, with a photo of the Wednesday board: "There is also
 * duplicates for Nov 11 for Benji & Sweety Graham — they are under
 * Stephanie & also in unassigned."
 *
 * They were one appointment each with different groomers, drawn correctly
 * in two columns — but both cards named the whole booking, so the same
 * pair of names appeared twice and read as one booking entered twice. A
 * card now names only its own dogs, which means it also has to say that
 * the rest of the booking exists, or a split family reads as two
 * unrelated appointments.
 *
 * The count comes first because every place this is drawn truncates on a
 * narrow column, so the tail of the phrase is what gets lost.
 */
export function formatFamilyBookingCount({
  onThisCard,
  inBooking,
}: {
  onThisCard: number;
  inBooking: number;
}): string {
  const total = Math.max(inBooking, onThisCard, 0);
  const here = Math.max(Math.min(onThisCard, total), 0);
  const dogs = total === 1 ? "dog" : "dogs";
  if (here >= total) return `${total} ${dogs}`;
  return `${here} of ${total} ${dogs}`;
}

/**
 * The small line under a family booking's name on a calendar card.
 *
 * Andy, 09/11/2026: "Booking should span both columns still." The card's
 * NAME narrows to the dogs it draws; the booking does not, so the count
 * here is the whole booking's and the pricing panel, the booking total
 * and the edit dialog are untouched.
 */
export function formatFamilyBookingLine(args: {
  onThisCard: number;
  inBooking: number;
}): string {
  return `${formatFamilyBookingCount(args)} · family booking`;
}
