import { describe, expect, it } from "vitest";
import {
  appointmentCardDensity, nameLineCount,
  NAME_ONLY_WIDTH, SERVICE_BADGE_WIDTH, SHORT_SERVICE_WIDTH, START_TIME_ONLY_WIDTH,
  CARD_PADDING_Y, STAMP_ROW_HEIGHT, NAME_LINE_HEIGHT, NAME_SECOND_LINE_HEIGHT,
  TIME_LINE_HEIGHT, SERVICE_BADGE_ROW_HEIGHT, CODES_ROW_HEIGHT,
} from "@shared/appointmentCardDensity";

/** A 94px staff column — the mobile floor — split between two dogs. */
const PHONE_SHARED = { widthPx: 47, heightPx: 90 };
/** The same column with one dog in it — still too narrow for a time. */
const PHONE_SOLO = { widthPx: 94, heightPx: 90 };
/** A tablet-ish column: room for the full time range, not the full badge. */
const MIDDLING = { widthPx: 124, heightPx: 90 };
/** A roomy desktop column on a two-hour booking. */
const DESKTOP = { widthPx: 320, heightPx: 144 };

/** 72px per hour on the board, so this is what a booking really gets. */
const hoursTall = (hours: number) => Math.round(hours * 72);

describe("appointmentCardDensity", () => {
  it("always keeps the dog's name", () => {
    for (const size of [PHONE_SHARED, PHONE_SOLO, DESKTOP, { widthPx: 20, heightPx: 22 }]) {
      expect(appointmentCardDensity(size).showName).toBe(true);
    }
  });

  /**
   * The bug in the photo: a long booking in a narrow column counted as
   * roomy on height alone and drew everything into 47 pixels.
   */
  it("draws nothing but the name in a column shared on a phone", () => {
    const d = appointmentCardDensity(PHONE_SHARED);
    expect(d.showTime).toBe(false);
    expect(d.serviceFormat).toBe("none");
    expect(d.showFamilyLine).toBe(false);
    expect(d.showNextVisit).toBe(false);
  });

  /**
   * 94px cannot hold "8:30 am - 10:00 am" (93px of content box needed,
   * 73 available) but holds "8:30am" easily. Dropping the time here was
   * a regression on DESKTOP too: two dogs overlapping in a 200px column
   * get 100px each, and those cards lost their times entirely.
   */
  it("shortens the time rather than dropping it in a narrow column", () => {
    const d = appointmentCardDensity(PHONE_SOLO);
    expect(d.timeFormat).toBe("start");
    expect(d.showTime).toBe(true);
    // Short badge, not the full one — 94px has no room for "CLASSIC GROOM".
    expect(d.serviceFormat).toBe("short");
  });

  it("drops the time only when even a start time will not fit", () => {
    expect(appointmentCardDensity(PHONE_SHARED).timeFormat).toBe("none");
    expect(appointmentCardDensity({ widthPx: START_TIME_ONLY_WIDTH, heightPx: 90 }).timeFormat).toBe("start");
    expect(appointmentCardDensity({ widthPx: START_TIME_ONLY_WIDTH - 1, heightPx: 90 }).timeFormat).toBe("none");
  });

  it("affords the full range but only a short badge at a middling width", () => {
    const d = appointmentCardDensity(MIDDLING);
    expect(d.timeFormat).toBe("range");
    expect(d.serviceFormat).toBe("short");
  });

  it("draws everything when there is real room", () => {
    const d = appointmentCardDensity({ ...DESKTOP, isFamilyBooking: true });
    expect(d.timeFormat).toBe("range");
    expect(d.serviceFormat).toBe("full");
    expect(d.showCodes).toBe(true);
    expect(d.showFamilyLine).toBe(true);
    expect(d.showNextVisit).toBe(true);
  });

  /** Height still governs — a wide but very short block has one line. */
  it("still refuses a second line in a short block, however wide", () => {
    const d = appointmentCardDensity({ widthPx: 320, heightPx: 30 });
    expect(d.showTime).toBe(false);
    expect(d.serviceFormat).toBe("none");
  });

  it("refuses the FULL badge in a tall but narrow block", () => {
    const d = appointmentCardDensity({ widthPx: SERVICE_BADGE_WIDTH - 1, heightPx: 200 });
    expect(d.serviceFormat).toBe("short");
    expect(d.showTime).toBe(true);
  });

  it("is exact at the boundaries rather than one pixel out", () => {
    expect(appointmentCardDensity({ widthPx: NAME_ONLY_WIDTH, heightPx: 90 }).timeFormat).toBe("range");
    expect(appointmentCardDensity({ widthPx: NAME_ONLY_WIDTH - 1, heightPx: 90 }).timeFormat).toBe("start");
    expect(appointmentCardDensity({ widthPx: SERVICE_BADGE_WIDTH, heightPx: 90 }).serviceFormat).toBe("full");
    expect(appointmentCardDensity({ widthPx: SERVICE_BADGE_WIDTH - 1, heightPx: 90 }).serviceFormat).toBe("short");
  });

  it("never shows the next visit without the time it sits under", () => {
    for (const w of [20, 47, 63, 64, 103, 104, 320]) {
      const d = appointmentCardDensity({ widthPx: w, heightPx: 90 });
      if (d.showNextVisit) expect(d.showTime).toBe(true);
    }
  });

  it("only claims a family line on a booking that has one", () => {
    expect(appointmentCardDensity(DESKTOP).showFamilyLine).toBe(false);
    expect(appointmentCardDensity({ ...DESKTOP, isFamilyBooking: true }).showFamilyLine).toBe(true);
  });
});

/**
 * Andy, 04/11/2026, with a photo of the board: "Still missing details
 * on appts view."
 *
 * The height budget assumed every card was a one-line name, a time and
 * a badge. Measured on the live board the same evening, 22 of the 34
 * cards on screen were drawing more than they had room for and
 * overflow-hidden was eating the difference — worst of them a 70px
 * card holding 136px of content.
 *
 * This block is the regression. The invariant at the bottom is the one
 * that matters: it is a property of EVERY card, and no assertion about
 * a particular pixel size would have caught the bug.
 */
describe("the card never asks for more height than it has", () => {
  /** Eddy & Albert Hartney: 75 minutes, VIP mark, two dogs, long name. */
  const THE_WORST_CARD = {
    widthPx: 150,
    heightPx: 70,
    hasStampRow: true,
    isFamilyBooking: true,
    nameLength: "Eddy & Albert Hartney".length,
  };

  it("fits the card that was losing half its content", () => {
    const d = appointmentCardDensity(THE_WORST_CARD);
    expect(d.requiredHeightPx).toBeLessThanOrEqual(THE_WORST_CARD.heightPx);
  });

  /**
   * The case this was all about. An hour-long booking is 72px and 16
   * of the 34 cards on the board are exactly that. Carrying a PAID
   * stamp on its own row left no room for the service badge, so the
   * badge was drawn into space the card did not have and clipped.
   *
   * Inlined, the badge fits — which is the detail Andy was missing.
   */
  it("keeps the service badge on an hour-long card that carries a stamp", () => {
    const stamped = appointmentCardDensity({
      widthPx: 200, heightPx: hoursTall(1), hasStampRow: true, nameLength: 12,
    });
    expect(stamped.stampInline).toBe(true);
    expect(stamped.serviceFormat).toBe("full");
    expect(stamped.requiredHeightPx).toBeLessThanOrEqual(hoursTall(1));
  });

  /**
   * But not at any width. A 105px card has 84px of content box, and
   * giving 43 of it to the pill leaves "Rub\u2026" — the truncation the
   * width rules exist to prevent. Narrow cards keep the row.
   */
  it("refuses to inline the stamp on a card too narrow to spare the width", () => {
    expect(appointmentCardDensity({ widthPx: 105, heightPx: 70, hasStampRow: true }).stampInline).toBe(false);
    expect(appointmentCardDensity({ widthPx: 78, heightPx: 70, hasStampRow: true }).stampInline).toBe(false);
    expect(appointmentCardDensity({ widthPx: 158, heightPx: 70, hasStampRow: true }).stampInline).toBe(true);
  });

  it("never inlines a stamp that is not there", () => {
    expect(appointmentCardDensity({ widthPx: 320, heightPx: 144 }).stampInline).toBe(false);
  });

  it("budgets the second line of a name that cannot fit on one", () => {
    const short = appointmentCardDensity({ widthPx: 150, heightPx: 200, nameLength: 4 });
    const long = appointmentCardDensity({ widthPx: 150, heightPx: 200, nameLength: 40 });
    expect(long.requiredHeightPx - short.requiredHeightPx).toBe(NAME_SECOND_LINE_HEIGHT);
  });

  /**
   * The real invariant, across every shape a card actually takes: the
   * widths a split column produces, the heights the 15-minute grid
   * produces, and all four combinations of the chrome.
   */
  it("holds for every width, height and combination of chrome", () => {
    const widths = [40, 47, 70, 92, 94, 104, 120, 132, 150, 200, 320];
    const heights = [18, 26, 36, 54, 70, 72, 90, 108, 144, 180, 216];
    const names = [3, 12, 21, 40];
    let checked = 0;
    for (const widthPx of widths) {
      for (const heightPx of heights) {
        for (const nameLength of names) {
          for (const hasStampRow of [false, true]) {
            for (const isFamilyBooking of [false, true]) {
              for (const isCancelled of [false, true]) {
                const d = appointmentCardDensity({
                  widthPx, heightPx, nameLength, hasStampRow, isFamilyBooking, isCancelled,
                });
                checked++;
                /*
                 * The name itself is allowed to overflow a card too
                 * short to hold even one line — a 18px sliver cannot
                 * be made to work and the colour block is the honest
                 * answer. What must never happen is density granting
                 * an OPTIONAL row that does not fit.
                 */
                if (d.requiredHeightPx > d.mandatoryHeightPx) {
                  expect(
                    d.requiredHeightPx,
                    `w=${widthPx} h=${heightPx} name=${nameLength} stamp=${hasStampRow} fam=${isFamilyBooking} cancelled=${isCancelled}`,
                  ).toBeLessThanOrEqual(heightPx);
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(widths.length * heights.length * names.length * 8);
  });
});

describe("nameLineCount", () => {
  it("wraps a long name and not a short one", () => {
    expect(nameLineCount(4, 150)).toBe(1);
    expect(nameLineCount(40, 150)).toBe(2);
  });

  it("never claims more than the two lines line-clamp-2 allows", () => {
    expect(nameLineCount(200, 50)).toBe(2);
  });

  it("treats a nameless card as one line rather than dividing by zero", () => {
    expect(nameLineCount(0, 150)).toBe(1);
    expect(nameLineCount(12, 0)).toBe(1);
  });
});

describe("the service degrades like the time does", () => {
  /**
   * Andy, 03/11/2026: "Some details are still not showing in the
   * preview on appt." Every overlapping booking had a name and a time
   * and no service — the one thing that says what the groom actually
   * is.
   */
  it("shortens the service on a narrow card rather than dropping it", () => {
    const d = appointmentCardDensity({ widthPx: 104, heightPx: 90 });
    expect(d.serviceFormat).toBe("short");
  });

  it("uses the full name when there is room", () => {
    expect(appointmentCardDensity({ widthPx: 320, heightPx: 90 }).serviceFormat).toBe("full");
    expect(appointmentCardDensity({ widthPx: SERVICE_BADGE_WIDTH, heightPx: 90 }).serviceFormat).toBe("full");
  });

  it("drops it only when even the short name crowds the dog's name out", () => {
    expect(appointmentCardDensity({ widthPx: SHORT_SERVICE_WIDTH, heightPx: 90 }).serviceFormat).toBe("short");
    expect(appointmentCardDensity({ widthPx: SHORT_SERVICE_WIDTH - 1, heightPx: 90 }).serviceFormat).toBe("none");
  });

  /** Height still governs: a one-line block has no room for a badge. */
  it("draws no badge in a short block however wide", () => {
    expect(appointmentCardDensity({ widthPx: 320, heightPx: 30 }).serviceFormat).toBe("none");
  });
});

/**
 * Andy, 04/11/2026: "A lot of the appt details are still missing from
 * the appt card. This needs to be fixed so it gives an overview of the
 * appointment for groomers to see at a glance" — name and service
 * first, then the warning codes.
 */
describe("appointmentCardDensity, the dog's codes", () => {
  /** Tall enough for the codes once the rows above are paid for. */
  const roomy = { widthPx: 200, heightPx: 120 };

  it("shows them on a card with room", () => {
    expect(appointmentCardDensity(roomy).showCodes).toBe(true);
  });

  /*
   * The order Andy gave. A card showing "DOG AGGRESSIVE" but not what
   * the dog is booked in FOR has the priority backwards, so codes must
   * never outlive the service badge.
   */
  it("never appears on a card too short for the service badge", () => {
    for (const heightPx of [30, 44, 57, 58, 70, 72]) {
      const d = appointmentCardDensity({ widthPx: 200, heightPx });
      if (d.serviceFormat === "none") expect(d.showCodes, `h=${heightPx}`).toBe(false);
    }
  });

  it("never appears on a card too narrow for even a short service", () => {
    for (const widthPx of [40, 60, 80, SHORT_SERVICE_WIDTH - 1]) {
      expect(appointmentCardDensity({ widthPx, heightPx: 120 }).showCodes, `w=${widthPx}`).toBe(false);
    }
  });

  /*
   * But codes DO outrank the next-visit line, which is the whole point
   * of putting them third rather than last.
   */
  it("outranks the nice-to-knows", () => {
    const narrow = appointmentCardDensity({ widthPx: SHORT_SERVICE_WIDTH, heightPx: 120 });
    expect(narrow.showCodes).toBe(true);
    expect(narrow.showNextVisit).toBe(false);
  });

  it("needs a line of its own under the badge", () => {
    const needed = CARD_PADDING_Y + NAME_LINE_HEIGHT + TIME_LINE_HEIGHT
      + SERVICE_BADGE_ROW_HEIGHT + CODES_ROW_HEIGHT;
    expect(appointmentCardDensity({ widthPx: 200, heightPx: needed - 1 }).showCodes).toBe(false);
    expect(appointmentCardDensity({ widthPx: 200, heightPx: needed }).showCodes).toBe(true);
  });

  /*
   * 105px, deliberately: wide enough for a short badge and for codes,
   * too narrow to inline the stamp. On a wider card the pill moves up
   * beside the name and costs nothing, which is the whole point of it
   * — so this has to be a card where the row is genuinely spent.
   */
  it("loses them first when a stamp row takes the space", () => {
    const needed = CARD_PADDING_Y + NAME_LINE_HEIGHT + TIME_LINE_HEIGHT
      + SERVICE_BADGE_ROW_HEIGHT + CODES_ROW_HEIGHT;
    expect(appointmentCardDensity({ widthPx: 105, heightPx: needed }).showCodes).toBe(true);
    expect(appointmentCardDensity({ widthPx: 105, heightPx: needed, hasStampRow: true }).showCodes).toBe(false);
    expect(appointmentCardDensity({ widthPx: 105, heightPx: needed + STAMP_ROW_HEIGHT, hasStampRow: true }).showCodes).toBe(true);
  });
});
