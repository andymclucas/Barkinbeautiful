import { describe, expect, it } from "vitest";
import { BOOKING_META_PIXEL_IDS, bookingMetaPixelId, bookingPrivacyUrl } from "./metaPixel";

describe("bookingMetaPixelId", () => {
  it("gives Barkin' Beautiful its own pixel on the live booking page", () => {
    expect(bookingMetaPixelId(1, { previewMode: false })).toBe("1917336606071879");
  });

  it("loads nothing in the staff preview", () => {
    expect(bookingMetaPixelId(1, { previewMode: true })).toBeNull();
  });

  it("gives a salon without a pixel nothing, never Barkin' Beautiful's", () => {
    expect(bookingMetaPixelId(2, { previewMode: false })).toBeNull();
  });

  it("only holds numeric ids", () => {
    for (const id of Object.values(BOOKING_META_PIXEL_IDS)) expect(id).toMatch(/^\d+$/);
  });
});

describe("bookingPrivacyUrl", () => {
  it("links Barkin' Beautiful's booking page to its own privacy policy", () => {
    expect(bookingPrivacyUrl(1)).toBe("https://barkinbeautiful.com.au/privacy/");
  });

  it("gives a salon without a policy no link, never Barkin' Beautiful's", () => {
    expect(bookingPrivacyUrl(2)).toBeNull();
  });
});
