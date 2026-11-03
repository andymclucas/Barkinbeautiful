import { describe, expect, it } from "vitest";
import {
  appointmentCardDensity, NAME_ONLY_WIDTH, SERVICE_BADGE_WIDTH,
  SHORT_SERVICE_WIDTH, START_TIME_ONLY_WIDTH,
} from "@shared/appointmentCardDensity";

/** A 94px staff column — the mobile floor — split between two dogs. */
const PHONE_SHARED = { widthPx: 47, heightPx: 90 };
/** The same column with one dog in it — still too narrow for a time. */
const PHONE_SOLO = { widthPx: 94, heightPx: 90 };
/** A tablet-ish column: room for the time, not for the badge. */
const MIDDLING = { widthPx: 124, heightPx: 90 };
/** A roomy desktop column. */
const DESKTOP = { widthPx: 320, heightPx: 90 };

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
    expect(d.showService).toBe(false);
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
    expect(d.showService).toBe(false);
  });

  it("drops the time only when even a start time will not fit", () => {
    expect(appointmentCardDensity(PHONE_SHARED).timeFormat).toBe("none");
    expect(appointmentCardDensity({ widthPx: START_TIME_ONLY_WIDTH, heightPx: 90 }).timeFormat).toBe("start");
    expect(appointmentCardDensity({ widthPx: START_TIME_ONLY_WIDTH - 1, heightPx: 90 }).timeFormat).toBe("none");
  });

  it("affords the full range but not the service badge at a middling width", () => {
    const d = appointmentCardDensity(MIDDLING);
    expect(d.timeFormat).toBe("range");
    expect(d.showService).toBe(false);
  });

  it("draws everything when there is real room", () => {
    const d = appointmentCardDensity(DESKTOP);
    expect(d.timeFormat).toBe("range");
    expect(d.showService).toBe(true);
    expect(d.showFamilyLine).toBe(true);
    expect(d.showNextVisit).toBe(true);
  });

  /** Height still governs — a wide but very short block has one line. */
  it("still refuses a second line in a short block, however wide", () => {
    const d = appointmentCardDensity({ widthPx: 320, heightPx: 30 });
    expect(d.showTime).toBe(false);
    expect(d.showService).toBe(false);
  });

  it("refuses the service badge in a tall but narrow block", () => {
    const d = appointmentCardDensity({ widthPx: SERVICE_BADGE_WIDTH - 1, heightPx: 200 });
    expect(d.showService).toBe(false);
    expect(d.showTime).toBe(true);
  });

  it("is exact at the boundaries rather than one pixel out", () => {
    expect(appointmentCardDensity({ widthPx: NAME_ONLY_WIDTH, heightPx: 90 }).timeFormat).toBe("range");
    expect(appointmentCardDensity({ widthPx: NAME_ONLY_WIDTH - 1, heightPx: 90 }).timeFormat).toBe("start");
    expect(appointmentCardDensity({ widthPx: SERVICE_BADGE_WIDTH, heightPx: 90 }).showService).toBe(true);
    expect(appointmentCardDensity({ widthPx: SERVICE_BADGE_WIDTH - 1, heightPx: 90 }).showService).toBe(false);
  });

  it("never shows the next visit without the time it sits under", () => {
    for (const w of [20, 47, 63, 64, 103, 104, 320]) {
      const d = appointmentCardDensity({ widthPx: w, heightPx: 90 });
      if (d.showNextVisit) expect(d.showTime).toBe(true);
    }
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
