/**
 * Returns the requested pets that are not already represented in a shared
 * appointment session. Order is preserved and repeated requests are ignored.
 */
export function getNewSharedSessionPetIds(existingPetIds: number[], requestedPetIds: number[]): number[] {
  const existing = new Set(existingPetIds);
  const added = new Set<number>();
  return requestedPetIds.filter((petId) => {
    if (existing.has(petId) || added.has(petId)) return false;
    added.add(petId);
    return true;
  });
}
