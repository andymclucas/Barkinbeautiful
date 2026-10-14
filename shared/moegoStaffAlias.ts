/**
 * Turning MoeGo's `Staffs` column into a Groomigo staff id.
 *
 * This is Trap 11 of the Monday sync, and it has already cost the salon
 * real work: on 14/10/2026 there were 107 forward bookings on the board
 * with nobody against them, every one of them imported from MoeGo, 101 of
 * them baths. Bookings created in Groomigo were unassigned 3% of the time;
 * imported ones, 49%.
 *
 * The cause was duplication rather than difficulty. The alias map was
 * written fresh in each run's script, and the two copies that existed had
 * already drifted: `scripts/moego-sync-2026-10-12.ts` knew "Bather 1" and
 * `scripts/moego-three-clients-2026-10-12.ts` knew "Bather 1" AND "Bather".
 * A run using the first one could not resolve "Bather", and inserted the
 * dog with no staff instead of stopping.
 *
 * So the map lives here, once. Two rules follow from the history:
 *
 *   1. An unresolved name is a RESULT, not a null. The caller cannot
 *      accidentally insert a staff-less appointment, because there is no
 *      staff id to insert — it has to read the failure and decide.
 *   2. Nothing is guessed. A substring match would be worse than useless:
 *      neither "Megan Graham" nor "Megs Graham" contains the other, so it
 *      misses the real case, and a loose match on a salon with an Ashleigh
 *      and an Ash would eventually file a dog under the wrong person.
 *
 * The aliases themselves are DATA, passed in, not a constant here. They are
 * one salon's staff — "bather 1" is Barkin' Beautiful's Stephanie and
 * means nothing anywhere else — and they live in `moego_staff_aliases`,
 * one row per tenant per MoeGo name.
 *
 * Each row points at a staff ID, not at another name. The old map was
 * name-to-name, so renaming Steph to Stephanie Baldwin on 12/10/2026 meant
 * moving the alias target by hand or 383 bath bookings stopped resolving.
 */

export type MoegoStaffMember = {
  id: number;
  name: string;
  isActive?: boolean | number | null;
};

export type MoegoStaffResolution =
  | { ok: true; staffId: number; staffName: string; viaAlias: boolean; raw: string }
  /** MoeGo had nobody on this booking. A real answer, not a failure to parse. */
  | { ok: false; kind: "absent"; raw: string }
  /** A name nobody recognises. Stop: this is how a dog lands on no column. */
  | { ok: false; kind: "unknown"; raw: string; normalised: string }
  /** Resolved to somebody who has left. Stop rather than book them. */
  | { ok: false; kind: "inactive"; raw: string; staffName: string };

/** One row of `moego_staff_aliases`. */
export type MoegoStaffAlias = {
  /** Normalised MoeGo name. See normaliseStaffName. */
  moegoName: string;
  staffId: number;
};

/** Index a tenant's aliases for lookup. */
export function aliasIndex(aliases: ReadonlyArray<MoegoStaffAlias>): Map<string, number> {
  return new Map(aliases.map((a) => [normaliseStaffName(a.moegoName), a.staffId]));
}

/** Case, padding and double spaces are not differences. */
export function normaliseStaffName(name: string | null | undefined): string {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The key a MoeGo string compares on.
 *
 * Aliases now resolve to an id rather than a name, so this is simply the
 * normalised form. Kept because the sync scripts compare two MoeGo-side
 * names to each other, where no roster is involved.
 */
export function moegoStaffKey(name: string | null | undefined): string {
  return normaliseStaffName(name);
}

function isActive(member: MoegoStaffMember): boolean {
  return member.isActive !== false && member.isActive !== 0 && member.isActive !== "0" as unknown;
}

/**
 * One MoeGo staff name against the roster.
 *
 * Exact match on the normalised, aliased name. Never a substring, never a
 * first-name match.
 */
export function resolveMoegoStaff(
  raw: string | null | undefined,
  roster: ReadonlyArray<MoegoStaffMember>,
  aliases: ReadonlyArray<MoegoStaffAlias> = [],
): MoegoStaffResolution {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: false, kind: "absent", raw: text };

  const normalised = normaliseStaffName(text);

  // An alias wins over a name match: it exists precisely because the MoeGo
  // name is not the Groomigo one.
  const aliasedId = aliasIndex(aliases).get(normalised);
  const match = aliasedId !== undefined
    ? roster.find((member) => member.id === aliasedId)
    : roster.find((member) => normaliseStaffName(member.name) === normalised);

  if (!match) return { ok: false, kind: "unknown", raw: text, normalised };
  if (!isActive(match)) return { ok: false, kind: "inactive", raw: text, staffName: match.name };

  return { ok: true, staffId: match.id, staffName: match.name, viaAlias: aliasedId !== undefined, raw: text };
}

/**
 * The `Staffs` column against the `Pet name` column.
 *
 * MoeGo comma-joins both, aligned by position. One staff name for several
 * pets means that person does all of them — which is the normal shape of a
 * family booking, and the reason this cannot just be a zip.
 *
 * A count that is neither 1 nor the number of pets is not guessable: the
 * names themselves may contain a comma (Trap 3). It returns an explicit
 * mismatch so the row goes to a human instead of being split wrongly.
 */
export function resolveMoegoStaffForPets(
  rawStaffs: string | null | undefined,
  petCount: number,
  roster: ReadonlyArray<MoegoStaffMember>,
  aliases: ReadonlyArray<MoegoStaffAlias> = [],
): { ok: true; perPet: MoegoStaffResolution[] } | { ok: false; kind: "mismatch"; names: string[]; petCount: number } {
  const names = String(rawStaffs ?? "").split(",").map((part) => part.trim()).filter((part) => part !== "");

  if (petCount <= 0) return { ok: false, kind: "mismatch", names, petCount };
  if (names.length === 0) {
    return { ok: true, perPet: Array.from({ length: petCount }, () => ({ ok: false, kind: "absent", raw: "" }) as MoegoStaffResolution) };
  }
  if (names.length === 1) {
    const one = resolveMoegoStaff(names[0], roster, aliases);
    return { ok: true, perPet: Array.from({ length: petCount }, () => one) };
  }
  if (names.length !== petCount) return { ok: false, kind: "mismatch", names, petCount };

  return { ok: true, perPet: names.map((name) => resolveMoegoStaff(name, roster, aliases)) };
}

/** A line for the run's report, so an unresolved name is readable. */
export function describeStaffResolution(resolution: MoegoStaffResolution): string {
  if (resolution.ok) {
    return resolution.viaAlias
      ? `${resolution.staffName} (MoeGo calls them "${resolution.raw}")`
      : resolution.staffName;
  }
  if (resolution.kind === "absent") return "nobody assigned in MoeGo";
  if (resolution.kind === "inactive") return `${resolution.staffName} has left — needs a decision`;
  return `unrecognised staff name "${resolution.raw}" — add an alias or stop`;
}
