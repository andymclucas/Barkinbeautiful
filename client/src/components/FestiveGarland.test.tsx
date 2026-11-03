import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FestiveGarland } from "./FestiveGarland";
import { FESTIVE_BULB_GOLD, FESTIVE_BULB_GREEN, FESTIVE_BULB_RED } from "@shared/brandPalette";

const garland = (compact = false) => {
  const { container } = render(<FestiveGarland compact={compact} />);
  return container;
};
const bulbs = (compact = false) =>
  Array.from(garland(compact).querySelectorAll(".festive-bulb")) as HTMLElement[];

/** "10%" -> 10 */
const pct = (value: string) => Number(value.replace("%", ""));

describe("FestiveGarland", () => {
  it("hangs a full string when the sidebar is open", () => {
    expect(bulbs()).toHaveLength(9);
  });

  it("thins out on the collapsed rail", () => {
    // Nine 9px bulbs across a 36px icon rail overlapped into one unreadable
    // smear. The count has to come down with the width.
    expect(bulbs(true)).toHaveLength(3);
  });

  it("spaces the bulbs evenly and keeps them off both ends", () => {
    // A bulb sitting exactly on the anchor point reads as a mistake.
    const lefts = bulbs().map((b) => pct(b.style.left));
    expect(lefts[0]).toBeGreaterThan(0);
    expect(lefts.at(-1)).toBeLessThan(100);
    const gaps = lefts.slice(1).map((x, i) => x - lefts[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);
  });

  it("hangs them along the sag rather than in a straight line", () => {
    // The middle bulb must sit lower than the two ends, or the garland is
    // a horizontal row of dots.
    const tops = bulbs().map((b) => pct(b.style.top));
    const middle = tops[Math.floor(tops.length / 2)];
    expect(middle).toBeGreaterThan(tops[0]);
    expect(middle).toBeGreaterThan(tops.at(-1)!);
  });

  it("never puts two of the same colour next to each other", () => {
    const colours = bulbs().map(
      (b) => (b.lastElementChild as HTMLElement).style.background,
    );
    expect(colours).toHaveLength(9);
    for (let i = 1; i < colours.length; i += 1) {
      expect(colours[i]).not.toBe(colours[i - 1]);
    }
  });

  it("uses the three bulb colours, not the two text-bearing ones", () => {
    const used = new Set(
      bulbs().map((b) => (b.lastElementChild as HTMLElement).style.background),
    );
    expect(used.size).toBe(3);
    // style.background normalises hex to rgb(), so compare through the DOM.
    const asRendered = (hex: string) => {
      const probe = document.createElement("div");
      probe.style.background = hex;
      return probe.style.background;
    };
    for (const colour of [FESTIVE_BULB_RED, FESTIVE_BULB_GREEN, FESTIVE_BULB_GOLD]) {
      expect(used.has(asRendered(colour))).toBe(true);
    }
  });

  it("staggers the twinkle so the string does not pulse as one block", () => {
    const delays = new Set(bulbs().map((b) => b.style.animationDelay));
    expect(delays.size).toBeGreaterThan(1);
  });

  it("is hidden from screen readers, being decoration", () => {
    // It carries no information; a reader announcing nine bulbs before the
    // navigation would be worse than useless.
    expect(garland().firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});
