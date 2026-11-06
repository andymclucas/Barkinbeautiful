/**
 * Which memberships are missing dogs, and how many they should have.
 *
 * The salon writes the dog count into the plan's NAME — "Silver+ (x2)",
 * "Gold VIP Styled - SML (0-10kg) X2 dogs", "x 3 DOGS". That name is
 * the only record of it: `memberships` has no count column, and
 * `nameLooksMultiDog` exists precisely because the name cannot be
 * trusted to price from.
 *
 * So this reads the name to decide what to ASK A HUMAN ABOUT, and
 * never to decide anything by itself. A plan whose name says two dogs
 * and which covers one gets put in front of staff; which dog is added
 * is their answer, not this module's guess. That is the same line
 * nameLooksMultiDog already draws — the count is for blocking and
 * flagging, never for pricing.
 */

/**
 * How many dogs a plan name claims to cover, or 1 when it says nothing.
 *
 * Matches the forms the salon actually writes, which are not
 * consistent: "x2", "X2 dogs", "x 3 DOGS", "2 x SML".
 */
export function dogsNamedInPlan(name: string | null | undefined): number {
  const text = String(name ?? "");
  const after = /(^|[^a-z0-9])x\s?([2-9])([^a-z0-9]|$)/i.exec(text);
  if (after) return Number(after[2]);
  const before = /(^|[^a-z0-9])([2-9])\s?x([^a-z0-9]|$)/i.exec(text);
  if (before) return Number(before[2]);
  return 1;
}

export type MembershipCoverage = {
  membershipId: number;
  name: string | null;
  /** Dogs currently recorded against the plan. */
  coveredPetIds: readonly number[];
};

/**
 * Whether staff should be asked about this plan.
 *
 * True only when the name claims more dogs than are recorded. A plan
 * covering as many as it claims — or more, because somebody decided so
 * — is left alone: the name is a prompt, not an authority, and
 * second-guessing a human's answer is how a review screen becomes
 * noise that everybody dismisses.
 */
export function needsPetAssignment(membership: MembershipCoverage): boolean {
  return membership.coveredPetIds.length < dogsNamedInPlan(membership.name);
}

/**
 * Every dog a plan covers: the dog it is filed under, plus any added.
 *
 * A UNION, not a choice between the two, because that is what pricing
 * does. `resolveAppointmentMembershipCoverage` claims each plan's
 * PRIMARY dog in its first pass and the assigned dogs in its second, so
 * a dog is covered if it is either. A badge reading "member" where the
 * price said otherwise is worse than no badge at all.
 *
 * In ordinary data the two cannot disagree: `setCoveredPets` forces the
 * primary dog into every write — "The primary dog is covered whether or
 * not it is ticked" — so the join table already holds it, and this
 * returns exactly what reading the table alone would. The union is for
 * data that never went through that procedure. The MoeGo import wrote
 * membership rows directly and nine households' plans turned out to be
 * filed under a single dog, so "the join table is always complete" is
 * not an assumption worth resting a dog's price on.
 *
 * Primary first, then the assigned dogs in the order given, de-duped.
 * Order is stable so a caller can show the plan's own dog first.
 */
export function planCoveredPetIds(plan: {
  petId?: number | null;
  assignedPetIds?: readonly number[] | null;
}): number[] {
  const covered: number[] = [];
  const add = (value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    if (!covered.includes(value)) covered.push(value);
  };
  add(plan.petId);
  for (const petId of plan.assignedPetIds ?? []) add(petId);
  return covered;
}

/**
 * Each dog, and the plans covering it.
 *
 * The client record draws a dog's tier colour from this, and builds the
 * departed-dog transfer dialog from it too, so a dog missing from the
 * map is a dog with no tier AND no way for staff to move or stop the
 * plan paying for it. It used to be built from `memberships.pet_id`
 * alone, which meant a household's second dog was absent from both.
 *
 * A plan appears against every dog it covers, so one plan can be the
 * value for several dogs — that is the "x2" case, not a bug. Plans keep
 * the order they were given, which is the caller's sort (newest first
 * on the client record), so `find(active)` picks the newest active one.
 */
export function membershipsByCoveredPet<T extends { coveredPetIds?: readonly number[] | null }>(
  plans: readonly T[],
): Record<number, T[]> {
  const byPet: Record<number, T[]> = {};
  for (const plan of plans) {
    for (const petId of plan.coveredPetIds ?? []) {
      if (typeof petId !== "number" || !Number.isFinite(petId)) continue;
      (byPet[petId] ??= []).push(plan);
    }
  }
  return byPet;
}

/** How many more dogs the name implies, never below zero. */
export function missingPetCount(membership: MembershipCoverage): number {
  return Math.max(0, dogsNamedInPlan(membership.name) - membership.coveredPetIds.length);
}
