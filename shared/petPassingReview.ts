/**
 * What needs deciding when a dog dies and money is attached to it.
 *
 * Andy, 22/10/2026: a client's dog died and he wanted the system to
 * raise the membership and credit questions rather than wait for
 * somebody to remember them.
 *
 * Two of the three things he asked for turned out not to need building,
 * and that is recorded here so nobody adds them later by reflex:
 *
 * - **Store credit needs no transfer.** `store_credit_transactions` has
 *   no `pet_id` — credit belongs to the CLIENT and already applies to
 *   whichever dog they book next. A transfer would invent a problem.
 * - **Prepaid blocks are not in use.** `service_packages` held 0 rows
 *   on 22/10/2026, so there is nothing to convert into appointments.
 *
 * What is left is the membership, which is the one that quietly keeps
 * charging. Kayla Fellingham was paying for a two-dog plan whose two
 * dogs had both died, and nothing anywhere said so.
 *
 * **Everything here proposes; nothing decides.** Each option is
 * presented for a person to click. Money and grief on the same screen
 * is not a place for a default action, and a membership somebody meant
 * to keep — the surviving dog's grooms are often prepaid through it —
 * must not be cancelled because a dialog defaulted that way.
 */

import { isEligibleMembershipReplacement, type ReplacementPetCandidate } from "./departedPetMembership";

export type ReviewMembership = {
  id: number;
  name: string;
  pricePerCycle: string | null;
  billingCycleWeeks: number | null;
  /** The pet the membership row points at. Often not the dog that died. */
  petId: number | null;
  petName: string | null;
};

export type ReviewPet = ReplacementPetCandidate & { name: string };

export type MembershipReview = {
  membership: ReviewMembership;
  /** True when this plan is attached to the dog that has just died. */
  attachedToDeparted: boolean;
  /** Surviving dogs this plan could move to, by weight band. */
  movableTo: { id: number; name: string }[];
  /**
   * What to put in front of the user first. Never applied on its own.
   *
   * - `cancel` when nothing can carry it.
   * - `move` when exactly one surviving dog fits.
   * - `choose` when several do, so the screen must ask which.
   */
  suggestion: "cancel" | "move" | "choose";
};

export type PassingReview = {
  petName: string;
  memberships: MembershipReview[];
  survivingPets: { id: number; name: string }[];
  /** Weekly total across every membership shown, for the headline. */
  weeklyTotal: number;
  /** Nothing financial is attached, so no prompt is needed at all. */
  isEmpty: boolean;
};

function weekly(m: ReviewMembership): number {
  const price = Number(m.pricePerCycle ?? 0);
  const weeks = Number(m.billingCycleWeeks ?? 1);
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (!Number.isFinite(weeks) || weeks <= 0) return price;
  return price / weeks;
}

/**
 * Builds the review for one passing.
 *
 * Shows EVERY active membership in the household, not only those
 * attached to the dog that died. The MoeGo import hung every plan off a
 * single pet, so "attached to" is not reliable evidence of who a plan
 * is for — Kayla's two-dog plan for Latte and Teacup was recorded
 * against Jemima. Flagging rather than filtering means a human sees the
 * one that matters instead of the system hiding it.
 */
export function buildPassingReview(input: {
  departedPet: ReviewPet;
  survivingPets: readonly ReviewPet[];
  memberships: readonly ReviewMembership[];
}): PassingReview {
  const surviving = input.survivingPets.filter((p) => p.id !== input.departedPet.id && p.status !== "departed");

  const memberships = input.memberships.map((membership): MembershipReview => {
    const movableTo = surviving
      .filter((pet) => isEligibleMembershipReplacement(input.departedPet, pet))
      .map((pet) => ({ id: pet.id, name: pet.name }));
    return {
      membership,
      attachedToDeparted: membership.petId === input.departedPet.id,
      movableTo,
      suggestion: movableTo.length === 0 ? "cancel" : movableTo.length === 1 ? "move" : "choose",
    };
  });

  const weeklyTotal = memberships.reduce((sum, m) => sum + weekly(m.membership), 0);

  return {
    petName: input.departedPet.name,
    memberships,
    survivingPets: surviving.map((p) => ({ id: p.id, name: p.name })),
    weeklyTotal: Math.round(weeklyTotal * 100) / 100,
    isEmpty: memberships.length === 0,
  };
}

/** One line for the bell, so the figure is visible without opening it. */
export function describePassingReview(review: PassingReview): string {
  if (review.isEmpty) return `${review.petName} was recorded as passed away.`;
  const count = review.memberships.length;
  const money = review.weeklyTotal > 0 ? ` worth $${review.weeklyTotal.toFixed(2)} a week` : "";
  return `${review.petName} was recorded as passed away. The household still has `
    + `${count} active membership${count === 1 ? "" : "s"}${money} — check whether `
    + `${count === 1 ? "it" : "they"} should move, stop or stay.`;
}
