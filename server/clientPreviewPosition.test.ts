import { describe, expect, it } from "vitest";
import {
  CLIENT_PREVIEW_GUTTER,
  CLIENT_PREVIEW_WIDTH,
  getClientPreviewSide,
} from "../client/src/lib/clientPreviewPosition";

describe("getClientPreviewSide", () => {
  it("opens to the right when the name has sufficient viewport space", () => {
    expect(getClientPreviewSide(240, 1440)).toBe("right");
  });

  it("opens to the left when a right-side card would be clipped", () => {
    expect(getClientPreviewSide(1180, 1440)).toBe("left");
  });

  it("treats the configured card width and gutter as required space", () => {
    const exactFit = 1440 - CLIENT_PREVIEW_WIDTH - CLIENT_PREVIEW_GUTTER;
    expect(getClientPreviewSide(exactFit, 1440)).toBe("right");
    expect(getClientPreviewSide(exactFit + 1, 1440)).toBe("left");
  });
});
