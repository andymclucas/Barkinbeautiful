/**
 * Which pet photo a request is allowed to remove.
 *
 * Staff photograph dogs on the floor all day and pick the wrong one
 * often enough that it had to be undoable — Charlie, 29/10/2026:
 * "I accidentally picked the wrong photo, it's the wrong dog". Until
 * then there was no delete path at all: `addPetPhoto` and the upload
 * route could create a row, and nothing could remove one.
 *
 * The rule is small but worth having on its own, because deleting by
 * id alone is the dangerous version. A photo id arriving from a page
 * that has been open a while can point at a row that has since moved
 * or gone, so the caller must also name the pet it believes the photo
 * belongs to. If those disagree, the request is refused rather than
 * deleting whatever the id happens to hit now.
 */
export type PetPhotoRow = {
  id: number;
  petId: number;
  tenantId: number;
};

export type PetPhotoDeletionRequest = {
  photoId: number;
  petId: number;
  tenantId: number;
};

export type PetPhotoDeletionVerdict =
  | { allowed: true }
  | { allowed: false; reason: "not_found" | "wrong_pet" | "wrong_tenant"; message: string };

export function petPhotoDeletionVerdict(
  photo: PetPhotoRow | undefined | null,
  request: PetPhotoDeletionRequest,
): PetPhotoDeletionVerdict {
  if (!photo) {
    return {
      allowed: false,
      reason: "not_found",
      // Already gone is not an error worth alarming anyone with — two
      // people on the same client record will both press delete.
      message: "That photo has already been removed.",
    };
  }
  if (photo.tenantId !== request.tenantId) {
    return {
      allowed: false,
      reason: "wrong_tenant",
      message: "That photo belongs to another salon.",
    };
  }
  if (photo.petId !== request.petId) {
    return {
      allowed: false,
      reason: "wrong_pet",
      message: "That photo is not on this dog's record. Reload the page and try again.",
    };
  }
  return { allowed: true };
}
