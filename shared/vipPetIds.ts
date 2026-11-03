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
 * Kept as a union rather than replacing the primary with the table.
 * When this was written `membership_pets` was empty for every plan — 0
 * rows across 151 active memberships — so dropping the primary would
 * have taken the badge off every dog in the salon at once.
 *
 * It is no longer empty: 56 rows across 26 plans by 04/11/2026, as the
 * x2/x3 dogs have been assigned. The union is still right, but do not
 * read the old "0 rows" as current — code that indexes plans by
 * `memberships.pet_id` alone now silently misses real dogs, which is
 * what `scripts/backfill-appointment-memberships.ts` was doing to 81
 * bookings until it was fixed the same day.
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
