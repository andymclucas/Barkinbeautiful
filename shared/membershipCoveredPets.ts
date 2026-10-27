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

/** How many more dogs the name implies, never below zero. */
export function missingPetCount(membership: MembershipCoverage): number {
  return Math.max(0, dogsNamedInPlan(membership.name) - membership.coveredPetIds.length);
}
