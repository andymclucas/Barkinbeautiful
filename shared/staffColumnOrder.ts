/**
 * The order a user wants the groomer and bather columns in.
 *
 * Andy, 26/10/2026: "Add function for users to be able to rearrange the
 * order of the groomers & bathers in the appointment tab. They should be
 * able to edit the view and then save it to their profile so any changes
 * becomes their default view."
 *
 * To their PROFILE, not their browser. The existing calendar column
 * filter lives in localStorage, which is per-device: Andy works on an
 * iPad and a desktop, and a preference that does not follow him is a
 * preference he has to set twice. So this is stored on the user row.
 *
 * The whole problem is that a saved order is a snapshot of a roster that
 * keeps changing. Somebody is hired, somebody leaves, somebody switches
 * from bathing to grooming. An order saved in March must still make
 * sense in October without anyone re-editing it, and must never make a
 * working groomer vanish from the board.
 */

export type OrderableStaff = {
  id: number;
  name: string;
  role?: string | null;
};

/** Groomers before bathers, then alphabetical — the order with no preference. */
export function defaultStaffOrder<T extends OrderableStaff>(staff: readonly T[]): T[] {
  return [...staff].sort((a, b) => {
    const group = (member: OrderableStaff) => (member.role === "bather" ? 1 : 0);
    return group(a) - group(b) || a.name.localeCompare(b.name);
  });
}

/**
 * Apply a saved order to the staff who actually work here now.
 *
 * Three things can have happened since it was saved, and all three have
 * to resolve without anyone noticing:
 *
 *  - someone LEFT: their id is in the saved order and not in `staff`. It
 *    is dropped. Keeping a position for a departed groomer would leave a
 *    gap that reappears if that id is ever reused.
 *  - someone JOINED: they are in `staff` and not in the saved order. They
 *    go after the ordered ones, in default order. Never dropped — a new
 *    groomer missing from the board is a dog nobody can book.
 *  - the saved order is rubbish — empty, malformed, duplicated ids. It is
 *    ignored in favour of the default rather than throwing.
 */
export function applyStaffOrder<T extends OrderableStaff>(
  staff: readonly T[],
  savedOrder: readonly number[] | null | undefined,
): T[] {
  const byId = new Map(staff.map((member) => [member.id, member]));
  const seen = new Set<number>();
  const ordered: T[] = [];

  for (const id of savedOrder ?? []) {
    const member = byId.get(id);
    if (!member || seen.has(id)) continue; // left, or a duplicate id
    seen.add(id);
    ordered.push(member);
  }

  // Anyone hired since the order was saved, in the order they would have
  // had with no preference at all.
  const rest = defaultStaffOrder(staff.filter((member) => !seen.has(member.id)));
  return [...ordered, ...rest];
}

/** Move one member up or down by a single place. Out-of-range is a no-op. */
export function moveStaff<T extends OrderableStaff>(
  staff: readonly T[],
  id: number,
  direction: "up" | "down",
): T[] {
  const index = staff.findIndex((member) => member.id === id);
  if (index < 0) return [...staff];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= staff.length) return [...staff];
  const next = [...staff];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * The stored form: ids separated by commas.
 *
 * Not JSON. TiDB has no JSON_TABLE — a query that tried to use it broke
 * every client record on 22/10/2026 — and a plain list keeps every read
 * a string split in JS, which is the same shape `parsePetCodes` already
 * uses for this schema.
 */
export function serialiseStaffOrder(ids: readonly number[]): string {
  return ids.filter((id) => Number.isInteger(id) && id > 0).join(",");
}

/** Read the stored form back. Anything unusable reads as "no preference". */
export function parseStaffOrder(stored: string | null | undefined): number[] {
  if (!stored || typeof stored !== "string") return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const part of stored.split(",")) {
    const id = Number(part.trim());
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Whether a saved order still says anything the default would not. */
export function orderDiffersFromDefault<T extends OrderableStaff>(
  staff: readonly T[],
  savedOrder: readonly number[] | null | undefined,
): boolean {
  const applied = applyStaffOrder(staff, savedOrder).map((m) => m.id);
  const fallback = defaultStaffOrder(staff).map((m) => m.id);
  return applied.join(",") !== fallback.join(",");
}
