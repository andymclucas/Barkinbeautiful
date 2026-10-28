/**
 * Which dogs on the board wear the VIP badge.
 *
 * Lauren, 28/10/2026: "Double dog memberships have the vip on one of
 * them." Millie and Cosi Constantini are one plan — "Diamond VIP - SML
 * (0-10kg) x2", $104 a cycle — and only Cosi had the badge.
 *
 * The board used to build this set from `memberships.pet_id` alone.
 * That column holds ONE dog, the plan's primary, so the second dog on
 * a two-dog plan was never in it. `membership_pets` is what records
 * the rest, and nothing was reading it: a plan covers its primary dog
 * AND every dog assigned to it.
 *
 * Kept as a union rather than replacing the primary with the table,
 * because `membership_pets` is empty for every plan today — 0 rows
 * across 151 active memberships. Dropping the primary would have taken
 * the badge off every dog in the salon at once.
 */
export function vipPetIds(input: {
  /** memberships.pet_id for each active plan. */
  primaryPetIds: readonly (number | null | undefined)[];
  /** membership_pets.pet_id for each active plan. */
  coveredPetIds: readonly (number | null | undefined)[];
}): Set<number> {
  const out = new Set<number>();
  for (const id of [...input.primaryPetIds, ...input.coveredPetIds]) {
    if (typeof id === "number" && Number.isFinite(id)) out.add(id);
  }
  return out;
}
