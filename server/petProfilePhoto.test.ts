import { describe, expect, it } from "vitest";
import { choosePetPhoto } from "@shared/petProfilePhoto";

const img = (data: string, contentType: string | null = "image/jpeg") => ({ data, contentType });

describe("choosePetPhoto", () => {
  /**
   * The reported bug, 05/11/2026: the wrong dog's picture was on a file
   * and could not be removed or replaced.
   *
   * `pets.photo_data` used to win, and nothing in the application can
   * write or clear that column — so for the 140 dogs that have one, the
   * avatar was permanent. Uploading a replacement changed nothing.
   */
  it("prefers the newest gallery photo, which is the one staff can change", () => {
    const chosen = choosePetPhoto({
      newestGalleryPhoto: img("GALLERY"),
      profilePhoto: img("IMPORTED"),
    });
    expect(chosen.source).toBe("gallery");
    expect(chosen.data).toBe("GALLERY");
  });

  /**
   * And the 139 dogs with an imported photo and no gallery keep it.
   * Flipping the order must not blank them.
   */
  it("still shows the imported photo when there is no gallery photo", () => {
    for (const gallery of [null, undefined, img(""), { data: null, contentType: null }]) {
      const chosen = choosePetPhoto({ newestGalleryPhoto: gallery, profilePhoto: img("IMPORTED") });
      expect(chosen.source).toBe("profile");
      expect(chosen.data).toBe("IMPORTED");
    }
  });

  it("reports no photo rather than serving an empty one", () => {
    expect(choosePetPhoto({}).source).toBe("none");
    expect(choosePetPhoto({ newestGalleryPhoto: img(""), profilePhoto: img("") }).source).toBe("none");
    expect(choosePetPhoto({}).data).toBeNull();
  });

  /**
   * Deleting the gallery photo has to put the old picture back, because
   * that is the undo staff reach for when they realise they added the
   * wrong dog. With the column winning there was no undo at all.
   */
  it("falls back to the imported photo once the gallery photo is deleted", () => {
    const before = choosePetPhoto({ newestGalleryPhoto: img("WRONG DOG"), profilePhoto: img("IMPORTED") });
    const after = choosePetPhoto({ newestGalleryPhoto: null, profilePhoto: img("IMPORTED") });
    expect(before.data).toBe("WRONG DOG");
    expect(after.data).toBe("IMPORTED");
  });

  /**
   * A row with bytes but no content type is still a picture. Refusing
   * it would blank a face on the board over a missing string.
   */
  it("serves an image whose content type was never recorded", () => {
    expect(choosePetPhoto({ newestGalleryPhoto: img("BYTES", null) }).contentType).toBe("image/jpeg");
    expect(choosePetPhoto({ profilePhoto: img("BYTES", "") }).contentType).toBe("image/jpeg");
  });

  it("keeps the recorded content type when there is one", () => {
    expect(choosePetPhoto({ newestGalleryPhoto: img("BYTES", "image/png") }).contentType).toBe("image/png");
  });
});
