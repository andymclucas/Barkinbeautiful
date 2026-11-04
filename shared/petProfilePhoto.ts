/**
 * Which picture is a dog's face on the board.
 *
 * Reported by a groomer, 05/11/2026: the wrong dog's photo had been put
 * on a file, and it could not be removed or replaced.
 *
 * A dog has two sources of picture and they were ranked the wrong way
 * round:
 *
 *  - `pets.photo_data`, a column holding one image. 140 dogs have one.
 *    It arrived with the MoeGo import and **nothing in the application
 *    can write or clear it** — there is no procedure and no route.
 *  - `pet_photos`, the gallery staff add to after a groom. Staff can
 *    add and delete these freely.
 *
 * The column used to win. For those 140 dogs that made the avatar
 * permanent: uploading a replacement did nothing, because the column
 * still won, and the column could not be cleared. "Cannot add over it"
 * was literally true, and no amount of deleting gallery photos helped.
 *
 * So the newest gallery photo wins and the column is the fallback. That
 * makes the avatar something staff can actually change — upload a photo
 * to replace it, delete it to go back — which is how they already
 * think the file works.
 *
 * Counted against production before the change: of 12,557 dogs, 140 had
 * the column, 279 had gallery photos, and **exactly one had both**. So
 * this reorders one dog's avatar today and unsticks 140.
 */

export type PetPhotoSource = "gallery" | "profile" | "none";

export type StoredImage = {
  /** base64, as both tables store it. */
  data: string | null | undefined;
  contentType: string | null | undefined;
};

export type ChosenPetPhoto =
  | { source: "none"; data: null; contentType: null }
  | { source: "gallery" | "profile"; data: string; contentType: string };

/** An image row only counts when it actually carries bytes. */
function hasBytes(image: StoredImage | null | undefined): image is StoredImage & { data: string } {
  return Boolean(image?.data && image.data.length > 0);
}

export function choosePetPhoto(input: {
  /** The dog's most recent gallery photo, if it has one. */
  newestGalleryPhoto?: StoredImage | null;
  /** The `pets.photo_data` column. */
  profilePhoto?: StoredImage | null;
}): ChosenPetPhoto {
  /*
   * Gallery first. A photo somebody took at the salon this morning is a
   * better likeness than whatever came across in an import two years
   * ago, and — the reason this changed — it is the one staff can
   * replace when it turns out to be the wrong dog.
   */
  if (hasBytes(input.newestGalleryPhoto)) {
    return {
      source: "gallery",
      data: input.newestGalleryPhoto.data,
      // A missing content type is still a real image; browsers sniff
      // it, and refusing to serve it would blank the board.
      contentType: input.newestGalleryPhoto.contentType || "image/jpeg",
    };
  }
  if (hasBytes(input.profilePhoto)) {
    return {
      source: "profile",
      data: input.profilePhoto.data,
      contentType: input.profilePhoto.contentType || "image/jpeg",
    };
  }
  return { source: "none", data: null, contentType: null };
}
