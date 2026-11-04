import { describe, expect, it, beforeEach } from "vitest";
import {
  getPetThumb, setPetThumb, forgetPetThumb, forgetAllPetThumbs, petThumbCacheSize,
} from "./petThumbCache";

describe("petThumbCache", () => {
  beforeEach(() => forgetAllPetThumbs());

  it("hands back what it was given", () => {
    setPetThumb(1021, Buffer.from("a dog"));
    expect(getPetThumb(1021)?.toString()).toBe("a dog");
  });

  /**
   * The whole reason this module exists. Before it, the cache had no
   * delete at all — only a wholesale wipe past 500 entries — so a photo
   * removed from a dog's file carried on being served as that dog's
   * face until the process restarted.
   */
  it("forgets one dog without disturbing the others", () => {
    setPetThumb(1, Buffer.from("one"));
    setPetThumb(2, Buffer.from("two"));
    forgetPetThumb(1);
    expect(getPetThumb(1)).toBeUndefined();
    expect(getPetThumb(2)?.toString()).toBe("two");
  });

  it("is untroubled by forgetting a dog it never held", () => {
    expect(() => forgetPetThumb(999999)).not.toThrow();
  });

  /** Bounded, so a long client list cannot grow it without limit. */
  it("stays bounded", () => {
    for (let id = 1; id <= 600; id++) setPetThumb(id, Buffer.from(String(id)));
    expect(petThumbCacheSize()).toBeLessThanOrEqual(500);
  });
});
