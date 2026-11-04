/**
 * Which rate a dog is being quoted, why, and how to pick another.
 *
 * Lauren, 04/11/2026, having booked Ruby in by hand: "easy enough to do
 * but manually have to edit price - don't know why it chose $180.. that
 * would be a new/casual client price. but doesn't show a choice of
 * pricing tiers."
 *
 * $180 is `Full Groom (Styled) - New Client - Small`, and it is CORRECT
 * by the salon's own rule. Andy, 13/10/2026: "Only actual members get
 * Bronze, everyone else pays Casual." Ruby's owner has no membership in
 * Groomigo, so the casual rate is what the price list says to charge.
 *
 * Nothing here changes that. The default is Andy's decision and it
 * stands. What was missing is both halves of Lauren's sentence:
 *
 * - **Why.** The box filled itself in with no explanation, so a correct
 *   price looked like a random one. A figure staff cannot account for
 *   gets overtyped, and then the price list means nothing.
 * - **The choice.** The rates were already on screen, inside a dropdown
 *   labelled "From the price list" — which reads as a catalogue lookup,
 *   not as "this client's rate". She did not find it, and she is the
 *   person who uses this form most.
 *
 * This is the reason it matters more than one booking: 1,020 of the
 * 1,162 clients with grooming history have no active membership, because
 * memberships are still being migrated from MoeGo one card at a time.
 * Every one of them is quoted the casual rate, correctly, and every one
 * of those is a moment where staff need to see why.
 */

import {
  pickDefaultPriceOption,
  PRICE_TIERS,
  PRICE_TIER_LABELS,
  type PriceOption,
  type PriceTier,
} from "./groomPricing";

export type TierChoice = {
  tier: PriceTier;
  label: string;
  /** Null when the price list carries no row for this tier. */
  priceAud: string | null;
  /** The catalogue row this would charge at, for the existing dropdown. */
  optionId: number | null;
  /** This tier's figure is the one currently in the box. */
  selected: boolean;
};

/**
 * One entry per tier the price list can quote for this dog and service.
 *
 * Every tier is returned, including the ones with no row — a gap is
 * worth showing as a gap. Three styled Regular cells are deliberately
 * unset in this catalogue, and a button that quietly vanishes reads as a
 * bug, where a greyed one reads as "we don't price that".
 */
export function tierChoices(
  options: readonly PriceOption[],
  currentPrice: string | null | undefined,
): TierChoice[] {
  const current = String(currentPrice ?? "").trim();
  return PRICE_TIERS.map((tier) => {
    // Reused rather than filtered by hand so a band-specific row still
    // beats a catch-all, exactly as it does when the box is filled in.
    const option = pickDefaultPriceOption(options.filter((o) => o.tier === tier), tier);
    const priceAud = option?.requiresManualPrice ? null : option?.priceAud ?? null;
    return {
      tier,
      label: PRICE_TIER_LABELS[tier],
      priceAud,
      optionId: option?.id ?? null,
      selected: priceAud !== null && current !== "" && Number(current) === Number(priceAud),
    };
  });
}

/**
 * The sentence under the price box.
 *
 * Names the membership when there is one, because "VIP rate" with no
 * reason is the same unexplained number from the other direction.
 */
export function explainTier(input: {
  tier: PriceTier;
  membershipTier?: string | null;
}): string {
  // Not lowercased: this is the start of its own sentence under the
  // price box, and "new client rate — ..." reads as a typo.
  const rate = PRICE_TIER_LABELS[input.tier];
  const membership = (input.membershipTier ?? "").trim();
  if (membership) {
    const name = membership.charAt(0).toUpperCase() + membership.slice(1).toLowerCase();
    return `${rate} rate — ${name} membership.`;
  }
  return `${rate} rate — no membership on file.`;
}
