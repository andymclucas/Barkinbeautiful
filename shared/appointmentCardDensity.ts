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

/**
 * How to draw the time, which is NOT a yes/no question.
 *
 * "8:30 am – 10:00 am" needs 93px of content box. "8:30am" needs about
 * 45. Dropping the time entirely because the RANGE will not fit throws
 * away the most useful thing on the card to save a format decision.
 */
export type TimeFormat = "range" | "start" | "none";

/**
 * How to draw the service, on the same principle as the time.
 *
 * "CLASSIC GROOM" needs more room than a narrow card has, but
 * "CLASSIC" does not — and a groomer scanning the board needs to know
 * it is a classic rather than a styled far more than they need the
 * word "groom", which is true of nearly every row.
 */
export type ServiceFormat = "full" | "short" | "none";

export type CardDensity = {
  /** The dog's name. Always drawn; the card is pointless without it. */
  showName: true;
  timeFormat: TimeFormat;
  /** True when any time at all is drawn. */
  showTime: boolean;
  serviceFormat: ServiceFormat;
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
 * Below this not even a bare start time fits, so the card is a coloured
 * block with a name in it.
 *
 * "8:30am" at 10px is about 45px, plus the 21px of padding.
 */
export const START_TIME_ONLY_WIDTH = 70;

/**
 * The service badge does not truncate, it WRAPS — which is where "CL
 * GR" in the photo came from. It is now nowrap at the call site, so
 * this is the width at which the whole word fits rather than the width
 * at which it stops wrapping.
 */
export const SERVICE_BADGE_WIDTH = 132;

/**
 * Below this even a shortened badge crowds out the name it sits under.
 *
 * "CLASSIC" at 9px bold is about 55px plus the badge's own 12px of
 * padding, inside a card whose content box is its width less 21.
 */
export const SHORT_SERVICE_WIDTH = 92;

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

  /*
   * The regression this replaces: a narrow card used to drop the time
   * altogether, so an overlapping booking on a DESKTOP column — two
   * dogs sharing 200px gives each 100 — showed a name and nothing
   * else. The information was there before and vanished.
   *
   * The original intent, written in calendarGridSizing, was always
   * "name and the start time, with the service carried by the colour".
   * That is what a narrow card gets.
   */
  const timeFormat: TimeFormat = !roomyEnoughForASecondLine
    ? "none"
    : input.widthPx >= NAME_ONLY_WIDTH
      ? "range"
      : input.widthPx >= START_TIME_ONLY_WIDTH
        ? "start"
        : "none";
  const showTime = timeFormat !== "none";

  return {
    showName: true,
    timeFormat,
    showTime,
    showService:
      input.heightPx >= SERVICE_BADGE_HEIGHT && input.widthPx >= SERVICE_BADGE_WIDTH,
    /*
     * Shortened rather than dropped, for the same reason the time is.
     * The board showed a name and a time but no service on every
     * overlapping booking, which is the one thing that tells a groomer
     * what they are about to do.
     */
    serviceFormat:
      input.heightPx < SERVICE_BADGE_HEIGHT
        ? "none"
        : input.widthPx >= SERVICE_BADGE_WIDTH
          ? "full"
          : input.widthPx >= SHORT_SERVICE_WIDTH
            ? "short"
            : "none",
    // Both of these are nice-to-know rather than need-to-know, so they
    // only appear once the card has already afforded the time.
    showFamilyLine: showTime,
    showNextVisit: showTime && input.widthPx >= SERVICE_BADGE_WIDTH,
  };
}
