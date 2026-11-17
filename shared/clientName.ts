/**
 * Tidying a client's name before it is saved.
 *
 * Lauren, 17/11/2026: "wont let me edit the last name spelling". Nothing
 * could: the Edit details box had no name fields and the save behind it
 * did not accept one, so a surname typed wrong at the counter was
 * permanent. The same gap the phone number had until 30/10/2026.
 *
 * Spaces at the ends are dropped and runs of spaces inside become one, so
 * "  Mc  Leod " is saved as "Mc Leod". Nothing else is changed: no
 * capitalising, because "van der Berg", "McLeod" and "de Souza" are all
 * right as typed and a rule that "fixes" them is wrong more often than not.
 */
export const CLIENT_NAME_MAX_LENGTH = 100;

export function cleanClientName(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, CLIENT_NAME_MAX_LENGTH);
}

/**
 * The names to save, or the reason they cannot be.
 *
 * A first name is required: it is what every text and email opens with.
 * A blank last name is allowed, because some records only ever had one
 * name and refusing to save them would block every other edit to them.
 * `undefined` for a field means "not being changed".
 */
export function clientNameUpdate(input: {
  firstName?: string | null;
  lastName?: string | null;
}): { ok: true; firstName?: string; lastName?: string } | { ok: false; message: string } {
  const out: { ok: true; firstName?: string; lastName?: string } = { ok: true };
  if (input.firstName !== undefined) {
    const first = cleanClientName(input.firstName);
    if (!first) return { ok: false, message: "A client needs a first name." };
    out.firstName = first;
  }
  if (input.lastName !== undefined) out.lastName = cleanClientName(input.lastName);
  return out;
}
