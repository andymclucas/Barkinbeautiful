import { afterEach, describe, expect, it } from "vitest";
import { META_PIXEL_SCRIPT_SRC, loadMetaPixel, resetMetaPixelForTests, trackMetaPixel } from "./metaPixel";

const scripts = () => document.querySelectorAll(`script[src="${META_PIXEL_SCRIPT_SRC}"]`);

describe("Meta Pixel loader", () => {
  afterEach(() => resetMetaPixelForTests());

  it("adds Meta's script once and queues init then PageView", () => {
    loadMetaPixel("123");
    expect(scripts()).toHaveLength(1);
    expect(window.fbq?.queue).toEqual([["init", "123"], ["track", "PageView"]]);
  });

  it("does not add a second script or re-init on a second visit", () => {
    loadMetaPixel("123");
    loadMetaPixel("123");
    expect(scripts()).toHaveLength(1);
    expect(window.fbq?.queue.filter(c => c[0] === "init")).toHaveLength(1);
    expect(window.fbq?.queue.filter(c => c[1] === "PageView")).toHaveLength(2);
  });

  it("records a booking only once a pixel is loaded", () => {
    trackMetaPixel("Schedule");
    expect(window.fbq).toBeUndefined();
    loadMetaPixel("123");
    trackMetaPixel("Schedule");
    expect(window.fbq?.queue.at(-1)).toEqual(["track", "Schedule"]);
  });
});
