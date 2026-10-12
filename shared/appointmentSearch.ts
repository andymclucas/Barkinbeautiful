/**
 * What pressing Enter in "Find appointment" should do.
 *
 * The dropdown lists matching APPOINTMENTS, which is right for "take me to
 * that booking". But the question behind most searches is "what has this
 * client got" — so Enter opens the client's agenda instead, upcoming and
 * previous in one place.
 *
 * It only does that when the answer is unambiguous. Searching "molly" can
 * match four different Mollys belonging to four different clients, and
 * opening the first one's agenda because it happened to sort first would be
 * a guess the person cannot see being made. In that case Enter does nothing
 * and the list stays up to be picked from.
 */

export type SearchedAppointment = {
  clientId: number | null;
  clientFirstName?: string | null;
  clientLastName?: string | null;
};

export type SoleClient = { clientId: number; name: string };

/**
 * The one client every result belongs to, or null when there isn't one.
 *
 * Null for no results, for results spanning more than one client, and for a
 * result with no client at all — all of which mean "don't open anything".
 */
export function soleClientOf(results: readonly SearchedAppointment[] | null | undefined): SoleClient | null {
  const rows = results ?? [];
  if (rows.length === 0) return null;

  const ids = new Set<number>();
  for (const r of rows) {
    if (r.clientId === null || r.clientId === undefined) return null;
    ids.add(r.clientId);
    if (ids.size > 1) return null;
  }
  // Array.from, not spread: the tsconfig target downlevels iteration.
  const clientId = Array.from(ids)[0];
  const first = rows[0];
  const name = `${first.clientFirstName ?? ""} ${first.clientLastName ?? ""}`.trim();
  return { clientId, name: name || "This client" };
}

/** How many distinct clients the results span — for the hint under the box. */
export function distinctClientCount(results: readonly SearchedAppointment[] | null | undefined): number {
  const ids = new Set<number>();
  for (const r of results ?? []) if (r.clientId !== null && r.clientId !== undefined) ids.add(r.clientId);
  return ids.size;
}
