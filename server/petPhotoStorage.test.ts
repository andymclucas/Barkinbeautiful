import { describe, expect, it } from "vitest";
import { buildPetPhotoStorageKey } from "./petPhotoStorage";

describe("buildPetPhotoStorageKey", () => {
  it("creates a namespaced, unique photo key with a safe image extension", () => {
    expect(buildPetPhotoStorageKey("image/jpeg", 12345, "abc123")).toBe("pet-photos/12345-abc123.jpeg");
    expect(buildPetPhotoStorageKey("image/svg+xml; charset=utf-8", 12345, "def456")).toBe("pet-photos/12345-def456.svgxml");
  });
});
