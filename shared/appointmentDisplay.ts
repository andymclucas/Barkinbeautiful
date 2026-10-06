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
