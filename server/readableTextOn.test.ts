import { describe, it, expect } from "vitest";
import { readableTextOn, contrastRatio, relativeLuminance } from "../shared/readableTextOn";

/** Every colour the staff board uses, which the catalogue offers too. */
const BOARD = ["#94a3b8", "#06b6d4", "#64748b", "#3b82f6", "#7c3aed", "#8b5cf6", "#b45309", "#f59e0b", "#10b981", "#ef4444"];

describe("readableTextOn", () => {
  it("puts dark text on amber, which is what white was failing on", () => {
    // White on #f59e0b is about 2:1. This is the case that prompted it.
    expect(readableTextOn("#f59e0b")).toBe("#111827");
  });

  it("puts white on a dark background", () => {
    expect(readableTextOn("#b45309")).toBe("#ffffff");
    expect(readableTextOn("#7c3aed")).toBe("#ffffff");
    expect(readableTextOn("#000000")).toBe("#ffffff");
  });

  it("puts dark text on a light background", () => {
    expect(readableTextOn("#ffffff")).toBe("#111827");
    expect(readableTextOn("#fef3c7")).toBe("#111827");
  });

  it("always picks whichever of the two contrasts more", () => {
    // The guarantee. Not "reaches AA" — see the test below for why that
    // is not achievable on every colour the board already uses.
    for (const colour of BOARD) {
      const chosen = contrastRatio(colour, readableTextOn(colour))!;
      const other = contrastRatio(colour, readableTextOn(colour) === "#ffffff" ? "#111827" : "#ffffff")!;
      expect(chosen, `${colour}: chose ${chosen.toFixed(2)} over ${other.toFixed(2)}`).toBeGreaterThanOrEqual(other);
    }
  });

  it("names the board colours that cannot reach AA whatever text is used", () => {
    /**
     * Honest limit. #8b5cf6, the Drying violet, tops out at 4.23:1 with
     * white and 4.19:1 with black — neither reaches the 4.5:1 AA
     * threshold for normal text. Nothing this function does can fix
     * that; only a different violet would. Pinned so the list cannot
     * grow unnoticed when somebody adds a colour.
     */
    const unreachable = BOARD.filter((c) => contrastRatio(c, readableTextOn(c))! < 4.5);
    expect(unreachable).toEqual(["#8b5cf6"]);
  });

  it("beats forcing white, which is what the chip did before", () => {
    const whiteFails = BOARD.filter((c) => contrastRatio(c, "#ffffff")! < 4.5);
    expect(whiteFails.length).toBeGreaterThan(0);
    for (const c of whiteFails) {
      expect(contrastRatio(c, readableTextOn(c))!).toBeGreaterThanOrEqual(contrastRatio(c, "#ffffff")!);
    }
  });

  it("weights green above blue, as the eye does", () => {
    // A naive (r+g+b)/3 average calls pure blue mid-bright and would put
    // black on it, which is unreadable.
    expect(readableTextOn("#0000ff")).toBe("#ffffff");
    expect(readableTextOn("#00ff00")).toBe("#111827");
  });

  it("falls back to white rather than producing invisible text", () => {
    for (const bad of [null, undefined, "", "not-a-colour", "#fff", "#12345g"]) {
      expect(readableTextOn(bad), String(bad)).toBe("#ffffff");
    }
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("is null for anything unusable", () => {
    expect(relativeLuminance("#abc")).toBeNull();
    expect(relativeLuminance(null)).toBeNull();
  });
});
