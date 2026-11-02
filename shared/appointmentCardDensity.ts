/**
 * How much of an appointment card to draw at the size it actually gets.
 *
 * Andy, 03/11/2026, with a photo of the day board on a phone: "Fix
 * alignment issues on mobile version." The cards read "Lou & Tor Tay",
 * "CL GR", "8." — a dog nobody can identify, a service shortened past
 * meaning, and a time cut off mid-digit.
 *
 * The cause was that density keyed off HEIGHT only. A long booking in a
 * narrow column counted as roomy, so the card cheerfully laid out a
 * service badge, a time range and a family-booking line into 47
 * horizontal pixels, and every one of them wrapped into slivers.
 *
 * Width matters more than height here, because the things being drawn
 * are words. The dog's name survives at every size — it is the only
 * reason to look at the board — and everything else earns its place.
 *
 * The widths are the card's own, AFTER the split between overlapping
 * dogs: a 94px staff column with two dogs side by side gives each 47.
 */

export type CardDensity = {
  /** The dog's name. Always drawn; the card is pointless without it. */
  showName: true;
  showTime: boolean;
  showService: boolean;
  /** "3 dogs · family booking". */
  showFamilyLine: boolean;
  /** "Next: 15 Dec". */
  showNextVisit: boolean;
};

/**
 * Below this a card is a coloured block with a name in it, and that is
 * the honest maximum.
 *
 * MEASURED, not guessed. On the real board a 104px card has an 83px
 * content box once padding is taken, and "8:30 am – 10:00 am" at 10px
 * needs 93 of them — so it truncates to something like "8:30 am – 10:0",
 * which is worse than no time at all because it looks like data rather
 * than damage. 120 is that 93 plus the 21px of padding plus a little
 * headroom for a longer range.
 *
 * The first version of this file put the figure at 64 from guesswork and
 * it was comfortably wrong; the number came from scrollWidth against
 * clientWidth on the actual cards.
 */
export const NAME_ONLY_WIDTH = 120;

/**
 * The service badge does not truncate, it WRAPS — which is where "CL
 * GR" in the photo came from. It is now nowrap at the call site, so
 * this is the width at which the whole word fits rather than the width
 * at which it stops wrapping.
 */
export const SERVICE_BADGE_WIDTH = 132;

/** A second line of text needs somewhere to go. */
export const SECOND_LINE_HEIGHT = 44;

/** The badge needs a line of its own under the time. */
export const SERVICE_BADGE_HEIGHT = 58;

export function appointmentCardDensity(input: {
  /** The card's own width in CSS pixels, after any overlap split. */
  widthPx: number;
  heightPx: number;
}): CardDensity {
  const roomyEnoughForASecondLine = input.heightPx >= SECOND_LINE_HEIGHT;
  const wideEnoughForWords = input.widthPx >= NAME_ONLY_WIDTH;

  const showTime = roomyEnoughForASecondLine && wideEnoughForWords;
  return {
    showName: true,
    showTime,
    showService:
      input.heightPx >= SERVICE_BADGE_HEIGHT && input.widthPx >= SERVICE_BADGE_WIDTH,
    // Both of these are nice-to-know rather than need-to-know, so they
    // only appear once the card has already afforded the time.
    showFamilyLine: showTime,
    showNextVisit: showTime && input.widthPx >= SERVICE_BADGE_WIDTH,
  };
}
