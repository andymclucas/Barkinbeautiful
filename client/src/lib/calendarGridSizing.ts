/**
 * How wide each staff column on the day calendar should be.
 *
 * It used to be a flat 320px per person, always. With twelve active staff
 * that is a 3,892px board on a 1,400px screen — nearly three screens of
 * sideways scrolling to answer "which box is this dog in?", which is
 * exactly what the salon floor asked us to stop doing.
 *
 * So columns now FIT the width available, and only fall back to scrolling
 * once they would be too narrow to read. Nobody scrolls to see a salon
 * that could have fitted.
 */

/** The most a column is ever given, however much room there is. */
export const READABLE_STAFF_COLUMN_WIDTH = 320;

/**
 * The least a column may shrink to.
 *
 * Chosen by looking at the cards, not by arithmetic: at 94px an 11px
 * appointment block still shows a pet's name (a short one in full, a long
 * one clearly truncated) and the start time, and the service is carried by
 * the colour. Below that the block stops identifying the dog, and a board
 * you scroll genuinely beats a board you cannot read.
 *
 * It happens to clear the salon's current roster: twelve staff fit a
 * 1,180px board exactly. That is a consequence, not the reason — the floor
 * is where the card stops being legible.
 */
export const MIN_STAFF_COLUMN_WIDTH = 94;

export function getDayCalendarGridSizing(
  staffCount: number,
  timeColumnWidth: number,
  options: {
    /**
     * The board's own width, measured from the DOM. Undefined means it has
     * not been measured yet — the first render, or a test — and the full
     * readable width is used, which is the behaviour this had before.
     */
    availableWidth?: number;
    maxColumnWidth?: number;
    minColumnWidth?: number;
  } = {},
) {
  const {
    availableWidth,
    maxColumnWidth = READABLE_STAFF_COLUMN_WIDTH,
    minColumnWidth = MIN_STAFF_COLUMN_WIDTH,
  } = options;

  const safeStaffCount = Math.max(1, Math.floor(staffCount));
  const staffColumnWidth = fitStaffColumnWidth({
    staffCount: safeStaffCount,
    timeColumnWidth,
    availableWidth,
    maxColumnWidth,
    minColumnWidth,
  });

  return {
    staffColumnWidth,
    totalWidth: timeColumnWidth + safeStaffCount * staffColumnWidth,
    gridTemplateColumns: `${timeColumnWidth}px repeat(${safeStaffCount}, ${staffColumnWidth}px)`,
  };
}

function fitStaffColumnWidth({
  staffCount,
  timeColumnWidth,
  availableWidth,
  maxColumnWidth,
  minColumnWidth,
}: {
  staffCount: number;
  timeColumnWidth: number;
  availableWidth?: number;
  maxColumnWidth: number;
  minColumnWidth: number;
}): number {
  // Unmeasured, or a width so small it cannot be real (a hidden tab reports
  // zero). Falling back to the readable width keeps the board correct until
  // a real measurement arrives, rather than flashing a one-pixel grid.
  if (!availableWidth || !Number.isFinite(availableWidth) || availableWidth <= timeColumnWidth) {
    return maxColumnWidth;
  }

  // Whole pixels. A fractional track width leaves a sub-pixel sliver at the
  // right-hand edge that reads as an off-by-one scroll on every board.
  const share = Math.floor((availableWidth - timeColumnWidth) / staffCount);

  // A floor, not a target: below this the cards stop being readable, and a
  // board you scroll beats a board you squint at.
  if (share < minColumnWidth) return minColumnWidth;

  return Math.min(share, maxColumnWidth);
}
