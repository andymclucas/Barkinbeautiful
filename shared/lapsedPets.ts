/**
 * The dogs behind each row of the Lapsed Customers report.
 *
 * Andy, 26/11/2026: "Add in an expand button on these clients so it drops
 * down with the dog details underneath the name." Whoever rings a lapsed
 * client needs to know which dog they are asking about, and whether that
 * dog is still with them: a departed dog is often the whole reason a
 * client stopped coming, and it is not a call to make blind.
 */

export type LapsedPetInput = {
  id: number;
  clientId: number;
  name: string;
  breed: string | null;
  weightKg: string | number | null;
  status: "active" | "departed" | "archived";
};

export type LapsedVisitInput = {
  petId: number | null;
  scheduledStart: Date | string;
};

export type LapsedPet = {
  id: number;
  name: string;
  breed: string | null;
  weightKg: number | null;
  status: "active" | "departed" | "archived";
  /** Completed grooms on record for this dog. */
  grooms: number;
  /** Its most recent completed groom, if any. */
  lastGroomed: Date | null;
};

const STATUS_ORDER: Record<LapsedPet["status"], number> = { active: 0, departed: 1, archived: 2 };

/**
 * Each client's dogs, with their own groom count and last groom.
 * Active dogs first, then departed, then archived; within that, the most
 * recently groomed first, so the dog the client actually brought sits at
 * the top.
 */
export function lapsedPetsByClient(
  pets: ReadonlyArray<LapsedPetInput>,
  visits: ReadonlyArray<LapsedVisitInput>,
): Map<number, LapsedPet[]> {
  const stats = new Map<number, { grooms: number; last: Date | null }>();
  for (const v of visits) {
    if (v.petId == null) continue;
    const at = v.scheduledStart instanceof Date ? v.scheduledStart : new Date(v.scheduledStart);
    const s = stats.get(v.petId) ?? { grooms: 0, last: null };
    s.grooms += 1;
    if (!Number.isNaN(at.getTime()) && (!s.last || at > s.last)) s.last = at;
    stats.set(v.petId, s);
  }

  const out = new Map<number, LapsedPet[]>();
  for (const p of pets) {
    const s = stats.get(p.id);
    const weight = p.weightKg == null || p.weightKg === "" ? null : Number(p.weightKg);
    const list = out.get(p.clientId) ?? [];
    list.push({
      id: p.id,
      name: p.name,
      breed: p.breed?.trim() || null,
      weightKg: weight !== null && Number.isFinite(weight) && weight > 0 ? weight : null,
      status: p.status,
      grooms: s?.grooms ?? 0,
      lastGroomed: s?.last ?? null,
    });
    out.set(p.clientId, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      || (b.lastGroomed?.getTime() ?? 0) - (a.lastGroomed?.getTime() ?? 0)
      || a.name.localeCompare(b.name));
  }
  return out;
}
