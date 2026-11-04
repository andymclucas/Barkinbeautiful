/**
 * Where overlapping appointments sit inside a groomer's column.
 *
 * Andy, 04/11/2026, with a photo of the day board on a phone: "Can we
 * overlap the appts that you can't read and have the ones above sit
 * over the top but make the opacity so that you can read all the appt
 * details of each one. Don't squash them so they are unreadable."
 *
 * Splitting the column evenly is right while there is room and ruinous
 * when there is not. A staff column is MIN_STAFF_COLUMN_WIDTH — 94px —
 * on a phone, so two dogs at once get 47px each and three get 31. The
 * photo shows the result: cards reading "R...", "N...", "O", "P". A
 * single letter is not an appointment.
 *
 * Cascading instead keeps every card nearly the full width of the
 * column and slides each one a little right of the last. Three dogs in
 * that same 94px column go from 31px to 70 — which is the width at
 * which shared/appointmentCardDensity.ts starts drawing a start time,
 * so the card goes from one letter to a name and a time.
 *
 * ## What this does NOT claim
 *
 * You cannot read three cards at once in 94px, whatever the
 * compositing. What the cascade buys is a readable card per dog with
 * the others showing as a stacked edge beside it, and whichever one is
 * tapped comes to the front. For reading a whole day at a glance on a
 * phone the agenda view is the right tool and this is not trying to
 * replace it.
 *
 * Splitting is kept wherever it still produces a readable card, so the
 * desktop board — 320px columns, two dogs at 160 each — is untouched.
 */

/** How far each card slides right of the one beneath it. */
export const CASCADE_STEP = 14;

/**
 * The narrowest a cascaded card may be, which is the width at which
 * appointmentCardDensity stops drawing even a bare start time. Below
 * this the cascade has bought nothing and the step shrinks instead.
 */
export const CASCADE_MIN_CARD = 70;

export type OverlapPlacement = {
  /** Offset from the column's left edge, in CSS pixels. */
  leftPx: number;
  widthPx: number;
  /** Later cards sit over earlier ones. */
  zIndex: number;
  /** True when the cards are stacked rather than split. */
  cascaded: boolean;
  /** How many cards this one sits on top of. 0 for the leftmost. */
  covers: number;
};

export function overlapPlacement(input: {
  /** 0-based position within the overlapping cluster. */
  col: number;
  /** How many appointments overlap here. 1 when none do. */
  totalCols: number;
  columnWidthPx: number;
}): OverlapPlacement {
  const totalCols = Math.max(1, Math.floor(input.totalCols));
  const col = Math.min(Math.max(0, Math.floor(input.col)), totalCols - 1);
  const columnWidthPx = Math.max(0, input.columnWidthPx);

  if (totalCols === 1) {
    return { leftPx: 0, widthPx: columnWidthPx, zIndex: 10, cascaded: false, covers: 0 };
  }

  const splitWidth = columnWidthPx / totalCols;
  if (splitWidth >= CASCADE_MIN_CARD) {
    // Room to split, so split: side by side is easier to read than a
    // stack whenever both fit, and it is what the desktop has always
    // done.
    return {
      leftPx: splitWidth * col,
      widthPx: splitWidth,
      zIndex: 10,
      cascaded: false,
      covers: 0,
    };
  }

  /*
   * The step gives way before the card does. Holding the step at 14
   * would make a four-dog cluster NARROWER than splitting it, which is
   * the bug this function exists to avoid — so the step is whatever
   * still leaves a readable card, down to nothing.
   */
  const floor = Math.min(CASCADE_MIN_CARD, columnWidthPx);
  const widestStep = (columnWidthPx - floor) / (totalCols - 1);
  const step = Math.max(0, Math.min(CASCADE_STEP, widestStep));

  return {
    leftPx: step * col,
    widthPx: columnWidthPx - step * (totalCols - 1),
    // Above the split case, so a cascaded card is never painted under a
    // neighbouring column's.
    zIndex: 20 + col,
    cascaded: true,
    covers: col,
  };
}
