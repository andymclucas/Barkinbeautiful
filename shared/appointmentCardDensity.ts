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
 *
 * ---
 *
 * Andy, 04/11/2026, with another photo: "Still missing details on appts
 * view." The widths were right by then and the heights were not.
 *
 * The height thresholds were three magic numbers — 44, 58, 76 — that
 * assumed every card was a one-line name, a time and a badge. Real
 * cards are not. Most carry a PAID stamp or a VIP mark in a row of
 * their own above the name, a shared booking adds "2 dogs · family
 * booking", a cancelled one adds a pill, and a long name wraps to two
 * lines. None of that was in the budget, so density said "there is
 * room" and `overflow-hidden` quietly ate the difference.
 *
 * MEASURED on the live board that evening, not guessed: **22 of the 34
 * cards on screen were clipping**, worst of them Eddy & Albert Hartney
 * at 136px of content inside a 70px card — the service badge and the
 * codes both wholly invisible. Every single clipped card had a stamp
 * row. The constants below are the real rendered heights of each row,
 * read off those cards with getBoundingClientRect.
 *
 * So the rule is no longer "is the card taller than N". It is: add up
 * what this particular card must draw, then spend what is left, in
 * priority order, one row at a time.
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
  /**
   * The dog's MoeGo tags — "✂5f, #7f, DOG AGGRESSIVE".
   *
   * Andy, 04/11/2026: "A lot of the appt details are still missing from
   * the appt card... so it gives an overview of the appointment for
   * groomers to see at a glance", and asked for name and service first,
   * then the warning codes.
   *
   * Shown as the salon writes them, NOT filtered to the scary ones.
   * shared/petCodes.ts explains why: the vocabulary is the salon's own,
   * and guessing which of 93 codes is a safety flag would either cry
   * wolf on a blade number or quietly fail to flag a biter.
   */
  showCodes: boolean;
  /**
   * Draw the PAID/VIP stamp beside the name instead of above it.
   *
   * Andy, 04/11/2026: "Still missing details on appts view." The pill
   * is 39px wide and was taking a 24px row to itself on a card only
   * 70px tall — and 16 of the 34 cards on the board are 70px, an
   * hour-long booking. Moving it up beside the name buys back the
   * service badge, which is second only to the dog's name in the
   * order Andy asked for.
   *
   * Simulated against the real board before it was written: the badge
   * went from 20 of 34 cards to 26.
   */
  stampInline: boolean;
  /**
   * What the card needs to draw everything above, in pixels.
   *
   * Exposed so a test can assert the card is not being asked to hold
   * more than it has — the failure that this whole file exists to
   * prevent, and the one no rendering assertion caught.
   */
  requiredHeightPx: number;
  /**
   * The part of that which is not negotiable: padding, the pills and
   * the name.
   *
   * A card too short even for this draws the name anyway and lets it
   * clip, because a coloured block with no name in it is useless. The
   * invariant is about the OPTIONAL rows, and needs to know where the
   * floor is to say so.
   */
  mandatoryHeightPx: number;
};

/* ---------------------------------------------------------------- *
 * Widths. Unchanged from 03/11 — these were measured and they work.
 * ---------------------------------------------------------------- */

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

/** The card's own horizontal padding, px-2 either side plus a border. */
export const CARD_PADDING_X = 21;

/* ---------------------------------------------------------------- *
 * Heights. Every one of these is the rendered height of that row on
 * the live board on 04/11/2026, INCLUDING its own margin, read with
 * getBoundingClientRect. Changing a font size or a margin at the call
 * site means re-measuring, not adjusting by eye.
 * ---------------------------------------------------------------- */

/** py-1, top and bottom. */
export const CARD_PADDING_Y = 8;

/** The PAID / part-paid stamp and the VIP mark share one row. */
export const STAMP_ROW_HEIGHT = 24;

/** The "Cancelled" pill, which sits above even the stamp. */
export const CANCELLED_ROW_HEIGHT = 24;

/** The dog's name, which is the one row every card always draws. */
export const NAME_LINE_HEIGHT = 16;

/** What a second line of name costs — it is line-clamp-2, not nowrap. */
export const NAME_SECOND_LINE_HEIGHT = 15;

/** "2 dogs · family booking". */
export const FAMILY_LINE_HEIGHT = 13;

/** "8:30 am – 10:00 am". */
export const TIME_LINE_HEIGHT = 15;

/** The service pill. */
export const SERVICE_BADGE_ROW_HEIGHT = 19;

/** The code chips, which wrap and so are the tallest single row. */
export const CODES_ROW_HEIGHT = 33;

/** "Next: 16 Dec". */
export const NEXT_VISIT_HEIGHT = 15;

/**
 * The PAID pill plus its gap, measured at 39px across all 13 stamped
 * cards on the board.
 *
 * It is the same width whatever it says, because the three states —
 * PAID, PART, UNPAID — are all five characters or fewer at 9px.
 */
export const STAMP_PILL_WIDTH = 43;

/**
 * Below this the pill is not worth moving up beside the name.
 *
 * A 105px card has an 84px content box; give 43 of it to the pill and
 * the name has 41, which is "Rub…" — the exact failure the width rules
 * above exist to prevent. Wide cards lose nothing, because the name
 * wraps to a second line at worst and that costs 15px against the 24
 * the row costs.
 */
export const STAMP_INLINE_MIN_WIDTH = 120;

/**
 * Median width of a character in the 12px bold name, measured across
 * the 47 names on the board.
 *
 * Used only to guess whether the name will wrap. Erring HIGH is the
 * safe direction: it predicts a second line sooner, which reserves
 * height that may not be needed. Erring low brings the clipping back.
 */
export const NAME_PX_PER_CHAR = 7.9;

/** How many lines the name will take. line-clamp-2 caps it at two. */
export function nameLineCount(nameLength: number, widthPx: number): 1 | 2 {
  const contentWidth = widthPx - CARD_PADDING_X;
  if (contentWidth <= 0 || nameLength <= 0) return 1;
  return nameLength * NAME_PX_PER_CHAR > contentWidth ? 2 : 1;
}

export function appointmentCardDensity(input: {
  /** The card's own width in CSS pixels, after any overlap split. */
  widthPx: number;
  heightPx: number;
  /** A PAID / part-paid stamp or a VIP mark is drawn above the name. */
  hasStampRow?: boolean;
  /** The "Cancelled" pill is drawn above everything. */
  isCancelled?: boolean;
  /** This is a shared booking, so a "N dogs" line sits under the name. */
  isFamilyBooking?: boolean;
  /** Characters in the name as drawn, used to predict a second line. */
  nameLength?: number;
}): CardDensity {
  /*
   * What the card is committed to before anything optional. The name is
   * not negotiable and neither are the stamps — they are drawn by the
   * call site whether or not density asks for them, which is exactly
   * why leaving them out of the budget hid the rows underneath.
   */
  const stampInline =
    Boolean(input.hasStampRow) && input.widthPx >= STAMP_INLINE_MIN_WIDTH;
  /*
   * An inlined pill eats into the name's line, so the name is measured
   * against what is left rather than the whole card.
   */
  const nameLines = nameLineCount(
    input.nameLength ?? 0,
    stampInline ? input.widthPx - STAMP_PILL_WIDTH : input.widthPx,
  );
  const base =
    CARD_PADDING_Y
    + (input.isCancelled ? CANCELLED_ROW_HEIGHT : 0)
    + (input.hasStampRow && !stampInline ? STAMP_ROW_HEIGHT : 0)
    + NAME_LINE_HEIGHT
    + (nameLines === 2 ? NAME_SECOND_LINE_HEIGHT : 0);

  let used = base;
  /** Whether one more row of this height still fits. */
  const affords = (rowHeight: number) => used + rowHeight <= input.heightPx;

  /*
   * The order below is the priority order, and it is deliberately the
   * same order as before: time, then service, then codes, then the
   * next visit. The arithmetic changed; the editorial judgement about
   * what matters did not, because that was Andy's call, not a bug.
   *
   * The family line rides with the time — it has always been drawn
   * only when the time is, and on a shared booking the two are read
   * together.
   */
  const timeCost = TIME_LINE_HEIGHT + (input.isFamilyBooking ? FAMILY_LINE_HEIGHT : 0);

  /*
   * The regression the width rules replaced: a narrow card used to drop
   * the time altogether, so an overlapping booking on a DESKTOP column
   * — two dogs sharing 200px gives each 100 — showed a name and
   * nothing else. The information was there before and vanished.
   */
  const widthTimeFormat: TimeFormat =
    input.widthPx >= NAME_ONLY_WIDTH
      ? "range"
      : input.widthPx >= START_TIME_ONLY_WIDTH
        ? "start"
        : "none";
  const timeFormat: TimeFormat = affords(timeCost) ? widthTimeFormat : "none";
  const showTime = timeFormat !== "none";
  if (showTime) used += timeCost;

  /*
   * Shortened rather than dropped, for the same reason the time is.
   * The board showed a name and a time but no service on every
   * overlapping booking, which is the one thing that tells a groomer
   * what they are about to do.
   */
  const widthServiceFormat: ServiceFormat =
    input.widthPx >= SERVICE_BADGE_WIDTH
      ? "full"
      : input.widthPx >= SHORT_SERVICE_WIDTH
        ? "short"
        : "none";
  const serviceFormat: ServiceFormat =
    affords(SERVICE_BADGE_ROW_HEIGHT) ? widthServiceFormat : "none";
  if (serviceFormat !== "none") used += SERVICE_BADGE_ROW_HEIGHT;

  /*
   * Codes rank ABOVE the time, the family line and the next visit, and
   * below the name and the service. A groomer reads "DOG AGGRESSIVE"
   * before they care when the dog is booked out.
   *
   * Width is the short-service threshold rather than one of its own:
   * below that a chip and the name are fighting for the same line, and
   * the name wins — it is the only reason to look at the card.
   *
   * A bite warning ignores all of this at the call site and is drawn
   * on any card, however small. That is deliberate and documented
   * there: a bather reaching into the tub needs it more than the card
   * needs to be tidy.
   */
  const showCodes =
    affords(CODES_ROW_HEIGHT) && input.widthPx >= SHORT_SERVICE_WIDTH;
  if (showCodes) used += CODES_ROW_HEIGHT;

  // Nice-to-know rather than need-to-know, so it goes last and only
  // once the card has already afforded the time.
  const showNextVisit =
    showTime && affords(NEXT_VISIT_HEIGHT) && input.widthPx >= SERVICE_BADGE_WIDTH;
  if (showNextVisit) used += NEXT_VISIT_HEIGHT;

  return {
    showName: true,
    timeFormat,
    showTime,
    serviceFormat,
    showService: serviceFormat !== "none",
    showCodes,
    showFamilyLine: showTime && Boolean(input.isFamilyBooking),
    showNextVisit,
    stampInline,
    mandatoryHeightPx: base,
    requiredHeightPx: used,
  };
}
