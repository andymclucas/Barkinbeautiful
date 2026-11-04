/**
 * The 96px pet avatars the board draws, kept in memory.
 *
 * Resizing on every request would be wasteful: the Workflow board draws
 * thirty of these and reloads often. So the route caches each dog's
 * thumbnail after the first resize.
 *
 * **It was never invalidated.** The only `clear()` was a wholesale wipe
 * once the map passed 500 entries. So a photo deleted from a dog's file
 * carried on being served as that dog's face until the Render process
 * happened to restart — which is why a groomer who deleted the wrong
 * dog's photo on 05/11/2026 reported that it could not be removed. The
 * delete had worked; the picture had not changed.
 *
 * This lives in its own module so the upload route, the delete
 * procedure and anything else that changes a dog's pictures can all
 * forget the thumbnail without importing each other.
 */

const MAX_ENTRIES = 500;
const thumbs = new Map<number, Buffer>();

export function getPetThumb(petId: number): Buffer | undefined {
  return thumbs.get(petId);
}

export function setPetThumb(petId: number, thumb: Buffer): void {
  // Bounded so a large client list cannot grow this without limit.
  if (thumbs.size >= MAX_ENTRIES) thumbs.clear();
  thumbs.set(petId, thumb);
}

/**
 * Call this from EVERY path that changes which picture a dog resolves
 * to — adding a gallery photo, deleting one, or writing the profile
 * column. Forgetting one puts a stale face back on the board with no
 * way for staff to shift it.
 */
export function forgetPetThumb(petId: number): void {
  thumbs.delete(petId);
}

/** Test seam, and a hook for anything that rewrites photos in bulk. */
export function forgetAllPetThumbs(): void {
  thumbs.clear();
}

export function petThumbCacheSize(): number {
  return thumbs.size;
}
