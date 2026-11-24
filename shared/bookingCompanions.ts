/**
 * The other dogs that can join a booking made from a client's own card.
 *
 * Lauren, 25/11/2026: "It's not letting me select both dogs to make an
 * appointment (This is in the main client card)".
 *
 * The card used to offer a second dog only when both were linked in a
 * family group. A client's own two dogs are one household whether or not
 * anybody has linked them, and the server books any of the client's dogs
 * together, so every other current dog of the client is offered. Family
 * links are still listed first, as the dogs most often booked together.
 */
export function bookingCompanions<P extends { id: number; familyGroupId?: number | null }>(
  clientPets: readonly P[],
  selectedPetId: number | null,
): P[] {
  const selected = clientPets.find((pet) => pet.id === selectedPetId);
  if (!selected) return [];
  const others = clientPets.filter((pet) => pet.id !== selected.id);
  const linked = (pet: P) =>
    selected.familyGroupId != null && pet.familyGroupId === selected.familyGroupId;
  return [...others.filter(linked), ...others.filter((pet) => !linked(pet))];
}
