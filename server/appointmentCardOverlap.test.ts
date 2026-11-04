import { describe, it, expect } from "vitest";
import { overlapPlacement, CASCADE_MIN_CARD, CASCADE_STEP } from "@shared/appointmentCardOverlap";
import { START_TIME_ONLY_WIDTH, appointmentCardDensity } from "@shared/appointmentCardDensity";
import { MIN_STAFF_COLUMN_WIDTH, READABLE_STAFF_COLUMN_WIDTH } from "@/lib/calendarGridSizing";

const PHONE = MIN_STAFF_COLUMN_WIDTH;     // 94
const DESKTOP = READABLE_STAFF_COLUMN_WIDTH; // 320

const widths = (totalCols: number, columnWidthPx: number) =>
  Array.from({ length: totalCols }, (_, col) =>
    overlapPlacement({ col, totalCols, columnWidthPx }));

describe("one appointment", () => {
  it("takes the whole column", () => {
    expect(overlapPlacement({ col: 0, totalCols: 1, columnWidthPx: PHONE }))
      .toEqual({ leftPx: 0, widthPx: PHONE, zIndex: 10, cascaded: false, covers: 0 });
  });
});

describe("a desktop column still splits", () => {
  it("puts two dogs side by side at 160px each", () => {
    const [a, b] = widths(2, DESKTOP);
    expect(a).toMatchObject({ leftPx: 0, widthPx: 160, cascaded: false });
    expect(b).toMatchObject({ leftPx: 160, widthPx: 160, cascaded: false });
  });

  it("splits four dogs, because 80px still draws a time", () => {
    const four = widths(4, DESKTOP);
    expect(four.every((p) => !p.cascaded)).toBe(true);
    expect(four[0].widthPx).toBe(80);
  });

  it("gives up splitting once a card would lose its time", () => {
    // 320/5 = 64, below the 70 at which a start time fits.
    expect(widths(5, DESKTOP).every((p) => p.cascaded)).toBe(true);
  });
});

/*
 * The photograph: a 94px column, cards reading "R...", "N...", "O".
 */
describe("a phone column cascades", () => {
  it("turns three 31px slivers into three 70px cards", () => {
    expect(PHONE / 3).toBeLessThan(START_TIME_ONLY_WIDTH);
    const three = widths(3, PHONE);
    expect(three.map((p) => p.widthPx)).toEqual([70, 70, 70]);
    expect(three.map((p) => p.leftPx)).toEqual([0, 12, 24]);
    expect(three.every((p) => p.cascaded)).toBe(true);
  });

  it("makes a cascaded card wide enough to draw a name and a time", () => {
    const [card] = widths(3, PHONE);
    const density = appointmentCardDensity({ widthPx: card.widthPx, heightPx: 90 });
    expect(density.showName).toBe(true);
    expect(density.timeFormat).toBe("start");
  });

  it("is always wider than splitting would have been", () => {
    for (const totalCols of [2, 3, 4, 5, 6, 8]) {
      const [card] = widths(totalCols, PHONE);
      expect(card.widthPx, `${totalCols} dogs`).toBeGreaterThan(PHONE / totalCols);
    }
  });

  it("stacks later cards over earlier ones", () => {
    const z = widths(3, PHONE).map((p) => p.zIndex);
    expect(z).toEqual([20, 21, 22]);
    expect(widths(3, PHONE).map((p) => p.covers)).toEqual([0, 1, 2]);
  });
});

/*
 * The trap this function exists to avoid: holding the step at 14 for a
 * big cluster makes the cascade NARROWER than the split it replaced.
 */
describe("the step gives way before the card does", () => {
  it("never lets a card fall below the readable floor", () => {
    for (const totalCols of [2, 3, 4, 6, 10, 20]) {
      const [card] = widths(totalCols, PHONE);
      expect(card.widthPx, `${totalCols} dogs`).toBeGreaterThanOrEqual(CASCADE_MIN_CARD);
    }
  });

  it("shrinks the step rather than the card", () => {
    const three = widths(3, PHONE);
    const eight = widths(8, PHONE);
    expect(three[1].leftPx).toBeGreaterThan(eight[1].leftPx);
    expect(three[0].widthPx).toBe(eight[0].widthPx);
  });

  it("uses the full step when the column can afford it", () => {
    // 200px, 3 dogs: split is 66 (too narrow), cascade can afford 14.
    const [card, second] = widths(3, 200);
    expect(second.leftPx).toBe(CASCADE_STEP);
    expect(card.widthPx).toBe(200 - CASCADE_STEP * 2);
  });

  it("never pushes a card past the column's right edge", () => {
    for (const columnWidthPx of [60, 94, 140, 200, 320]) {
      for (const totalCols of [1, 2, 3, 5, 9]) {
        const last = widths(totalCols, columnWidthPx)[totalCols - 1];
        expect(last.leftPx + last.widthPx, `${columnWidthPx}px / ${totalCols}`)
          .toBeLessThanOrEqual(columnWidthPx + 0.001);
      }
    }
  });

  it("copes with a column narrower than the floor itself", () => {
    const two = widths(2, 50);
    expect(two.every((p) => p.widthPx === 50)).toBe(true);
    expect(two.every((p) => p.leftPx === 0)).toBe(true);
  });
});

describe("bad input", () => {
  it("clamps a column index outside the cluster", () => {
    expect(overlapPlacement({ col: 9, totalCols: 3, columnWidthPx: PHONE }).covers).toBe(2);
    expect(overlapPlacement({ col: -4, totalCols: 3, columnWidthPx: PHONE }).covers).toBe(0);
  });

  it("treats a zero or negative cluster as a single card", () => {
    expect(overlapPlacement({ col: 0, totalCols: 0, columnWidthPx: PHONE }).widthPx).toBe(PHONE);
  });

  it("does not produce a negative width for a zero-width column", () => {
    expect(overlapPlacement({ col: 1, totalCols: 3, columnWidthPx: 0 }).widthPx).toBe(0);
  });
});
