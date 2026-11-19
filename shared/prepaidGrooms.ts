/**
 * A block of grooms paid for up front, and how many are left.
 *
 * Lauren, 19/11/2026: a client paid $875 by bank transfer in June for a
 * year of six-weekly grooms and it was recorded nowhere: "we need to work
 * out how to keep a track of this." Her own way of running it: "I put in
 * the amount of appointments at $0 that they would receive on their
 * membership... this chic 9 appointments as she comes 6 weekly."
 *
 * Andy, 19/11/2026: "go with the groom option (nine bookings at $0 with a
 * count)."
 *
 * So the unit is a GROOM, not a dollar. The block records what was paid and
 * how many grooms it bought; each groom taken is counted off against the
 * booking it was used on, and what is left is a number of grooms. Nothing
 * here prices a booking or takes money: the bookings stay at $0 as Lauren
 * enters them, and add-ons are charged on the day as they always are.
 */
export type PrepaidBlock = {
  creditsTotal: number;
  creditsUsed: number;
  status?: string | null;
  expired?: boolean | null;
};

/** "5 of 9 left", or why none can be used. */
export function prepaidBlockLabel(block: PrepaidBlock): string {
  if (block.status === "cancelled") return "Cancelled";
  const left = Math.max(0, block.creditsTotal - block.creditsUsed);
  if (left === 0) return "All used";
  if (block.expired) return "Expired";
  return `${left} of ${block.creditsTotal} left`;
}

/** Whether another groom can be counted off this block. */
export function prepaidBlockUsable(block: PrepaidBlock): boolean {
  return block.status !== "cancelled" && !block.expired && block.creditsUsed < block.creditsTotal;
}

export type PrepaidCandidate = {
  id: number;
  scheduledStart: Date | string | number;
  status?: string | null;
  workflowState?: string | null;
};

const DEAD = new Set(["cancelled", "no_show"]);

/**
 * The bookings a groom could be counted off against.
 *
 * Not a cancelled or no-show booking (no groom happened), not one already
 * counted, and not one from before the block was paid for. Oldest first, so
 * the grooms already done are at the top when a block is entered late.
 */
export function prepaidCandidates<T extends PrepaidCandidate>(
  appointments: readonly T[],
  alreadyCounted: ReadonlyArray<number>,
  paidOn: Date | string | number,
): T[] {
  const counted = new Set(alreadyCounted);
  const from = new Date(paidOn).getTime();
  return appointments
    .filter((a) => !DEAD.has(String(a.status)) && !DEAD.has(String(a.workflowState)))
    .filter((a) => !counted.has(a.id))
    .filter((a) => new Date(a.scheduledStart).getTime() >= from)
    .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
}
