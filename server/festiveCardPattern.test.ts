import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * The Christmas card pattern can never be turned up loud.
 *
 * Andy, 03/11/2026: "Perhaps a Christmas background for all cards when in
 * Xmas theme mode."
 *
 * The snowflakes sit behind prices, phone numbers and grooming notes that
 * staff read all day. At 5% (7% in dark) they read as textured card stock
 * and leave the text alone; at 20% they are a pattern someone is reading
 * THROUGH, and the salon would ask for the whole theme off by Boxing Day.
 *
 * The opacity is the entire design and it is one character away from being
 * wrong, so it is pinned rather than trusted. This is a numeric invariant
 * on a static asset, not an assertion about rendering - there is no DOM
 * involved and nothing to render it in.
 *
 * WHEN THIS FAILS: someone has made the pattern more visible. If that is
 * deliberate, look at a card with small grey text on it first - the
 * muted-foreground captions are what suffers, not the headings.
 */
const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");

/** The festive card block, from its heading to the next one. */
const section = css.slice(
  css.indexOf("── Christmas card stock"),
  css.indexOf("── Christmas candy stripe"),
);

describe("the festive card pattern", () => {
  it("is actually in the stylesheet", () => {
    expect(section.length).toBeGreaterThan(200);
    expect(section).toContain('.festive [data-slot="card"]');
    expect(section).toContain(".festive .bg-card");
  });

  it("covers dark mode with its own rule", () => {
    // A dark green flake on a dark green card is invisible, so dark mode
    // cannot share the light rule.
    expect(section).toContain('.dark.festive [data-slot="card"]');
  });

  it("keeps every flake faint enough to read through", () => {
    const opacities = [...section.matchAll(/stroke-opacity='\.(\d+)'/g)]
      .map((m) => Number(`0.${m[1]}`));
    expect(opacities.length).toBeGreaterThanOrEqual(2);
    for (const opacity of opacities) {
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThanOrEqual(0.08);
    }
  });

  it("paints only the image, never the whole background shorthand", () => {
    // `background:` would discard the card's own background-color and put
    // the page behind the text.
    expect(section).toContain("background-image:");
    expect(section).not.toMatch(/\n\s*background:\s/);
  });

  it("leaves the tile sparse, so most of a line of text has nothing behind it", () => {
    // Two small flakes per 96px tile. A denser tile at the same opacity
    // still reads as noise behind a caption.
    const tiles = [...section.matchAll(/width='(\d+)' height='(\d+)'/g)];
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    for (const [, w, h] of tiles) {
      expect(Number(w)).toBeGreaterThanOrEqual(72);
      expect(Number(h)).toBeGreaterThanOrEqual(72);
    }
  });
});
