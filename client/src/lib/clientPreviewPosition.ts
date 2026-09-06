export const CLIENT_PREVIEW_WIDTH = 320;
export const CLIENT_PREVIEW_GUTTER = 16;

/**
 * Keep a client quick preview close to its trigger while avoiding a clipped card
 * at the right edge of a desktop viewport. Radix still provides final collision
 * handling for vertical boundaries and smaller screens.
 */
export function getClientPreviewSide(anchorRight: number, viewportWidth: number): "left" | "right" {
  return anchorRight + CLIENT_PREVIEW_WIDTH + CLIENT_PREVIEW_GUTTER <= viewportWidth
    ? "right"
    : "left";
}
