/**
 * What each dog on a multi-dog booking is charged.
 *
 * Andy, 27/10/2026: "it only assigned the full price to one of the dogs.
 * It needs to be the exact price set out for each dog."
 *
 * The booking form sends a per-dog map AND a single price box. The
 * server used `priceByPetId[pet] ?? price`, so a dog missing from the
 * map silently took the WHOLE booking figure. On a three-dog booking
 * that put $590 — the total for all three, add-ons included — onto one
 * dog and left the others at nothing.
 *
 * A dog missing from the map is a dog nobody priced. The honest answer
 * is no price, which the salon already handles: an unpriced appointment
 * is excluded from invoicing and shows as "not priced yet" rather than
 * settled. Guessing is what produced a $590 Ruby.
 *
 * The single box still works for a single-dog booking, where "the price"
 * and "this dog's price" are the same thing.
 */

export function priceForPet(input: {
  petId: number | string;
  /** Per-dog figures from the booking form. */
  priceByPetId?: Record<string, string | number | null | undefined> | null;
  /** The single price box. Only meaningful when one dog is being booked. */
  singlePrice?: string | number | null | undefined;
  /** How many dogs are on this booking. */
  petCount: number;
}): string | null {
  const own = input.priceByPetId?.[String(input.petId)];
  if (own !== undefined && own !== null && String(own).trim() !== "") return String(own);

  // One dog: the box is unambiguous, so it is this dog's price.
  if (input.petCount === 1) {
    const single = input.singlePrice;
    if (single !== undefined && single !== null && String(single).trim() !== "") return String(single);
  }

  // Several dogs and no figure for this one. Leaving it unpriced is
  // visible and fixable; charging it the whole booking is neither.
  return null;
}
