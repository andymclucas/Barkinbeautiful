import { describe, expect, it } from "vitest";
import { BOARD_DESIGN_WIDTH, BOARD_MIN_SCALE, boardFitScale } from "./boardFitScale";

describe("boardFitScale", () => {
  it("leaves the board alone at or above the design width", () => {
    expect(boardFitScale(BOARD_DESIGN_WIDTH)).toBe(1);
    expect(boardFitScale(2600)).toBe(1);
  });

  it("shrinks it in proportion on a narrower screen", () => {
    expect(boardFitScale(BOARD_DESIGN_WIDTH / 2 + BOARD_DESIGN_WIDTH / 4)).toBe(0.75);
    // A 1920x1080 monitor at 125% with the sidebar open leaves about 1230px.
    expect(boardFitScale(1230)).toBeCloseTo(1230 / BOARD_DESIGN_WIDTH, 3);
  });

  it("never goes below the floor", () => {
    expect(boardFitScale(400)).toBe(BOARD_MIN_SCALE);
  });

  it("never scales on a touch screen", () => {
    expect(boardFitScale(1100, { coarsePointer: true })).toBe(1);
  });

  it("treats an unmeasured width as no scaling", () => {
    expect(boardFitScale(0)).toBe(1);
    expect(boardFitScale(Number.NaN)).toBe(1);
  });

  it("rounds to three places so sub-pixel jitter does not re-render", () => {
    const scale = boardFitScale(1234.5678);
    expect(scale).toBe(Math.round(scale * 1000) / 1000);
  });
});
