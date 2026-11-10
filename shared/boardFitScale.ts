/**
 * How much to shrink the Workflow Board so it looks the same on any screen.
 *
 * Andy, 10/11/2026, from a 1920x1080 monitor: "Can we make the alignment
 * to be dynamic depending on the screen, resolution etc. ... It needs to
 * look the same regardless."
 *
 * The board is a wide table with automatic column widths. Given less room
 * than it was laid out for, the browser squeezes whichever columns have
 * flexible content: Dog / Owner wraps, "Texted 3:32 pm" breaks over two
 * lines, and the family brackets, which are fixed-size and drawn on top,
 * land on the text. The header's filters truncate.
 *
 * So instead of letting the columns reflow, the whole board is scaled
 * down as one picture, the way the TV wall screen is. The layout is
 * always the one at DESIGN_WIDTH; a narrower screen just sees it smaller.
 *
 * - At or above the design width the board is not scaled: it widens
 *   naturally, as it always has on Andy's own screen.
 * - Never below MIN_SCALE. A very narrow desktop window keeps the
 *   horizontal scroll the table already had rather than unreadable text.
 * - Never on a touch screen. The salon floor uses iPads, where shrinking
 *   the board would shrink the tap targets too; they keep today's layout.
 */

/** The board's width on Andy's usual 4K screen, measured 10/11/2026 (1658px). */
export const BOARD_DESIGN_WIDTH = 1660;

/** 0.6 keeps 14px text at about 8.5px — small, but still readable on a desktop. */
export const BOARD_MIN_SCALE = 0.6;

export function boardFitScale(
  availableWidth: number,
  options: { coarsePointer?: boolean; designWidth?: number; minScale?: number } = {}
): number {
  const designWidth = options.designWidth ?? BOARD_DESIGN_WIDTH;
  const minScale = options.minScale ?? BOARD_MIN_SCALE;
  if (options.coarsePointer) return 1;
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  if (availableWidth >= designWidth) return 1;
  const scale = Math.max(minScale, availableWidth / designWidth);
  // Three places is finer than a pixel at these widths, and stops a
  // ResizeObserver re-rendering on sub-pixel jitter.
  return Math.round(scale * 1000) / 1000;
}
