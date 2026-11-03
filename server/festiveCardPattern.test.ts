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

  it("gives dark mode its own flake colour", () => {
    // A dark green flake on a dark green card is invisible, so dark mode
    // cannot share light's tile. Asserted on the variable rather than on a
    // selector, because which selectors read it is free to change.
    expect(section).toMatch(/\.dark\.festive\s*\{[^}]*--festive-flakes:/);
    expect(section).toMatch(/\.festive\s*\{[^}]*--festive-flakes:/);
  });

  it("reaches the panels inside a card, not just the card", () => {
    // Andy, 03/11/2026: "add the snowflakes to the inner panels too". A
    // panel on bg-muted/50 is half transparent, so it was showing the
    // dialog's flakes at about 2.5% - which is to say not at all.
    expect(section).toContain('[class*="bg-muted"].rounded-lg');
  });

  it("leaves chips and badges alone", () => {
    // A 96px tile inside a 20px chip is a clipped smudge. The small radii
    // on a muted fill are buttons, badges and icon tiles.
    for (const small of ["rounded-md", "rounded-full", "rounded-sm"]) {
      expect(section).not.toContain(`[class*="bg-muted"].${small}`);
    }
  });

  it("writes the tile once, so the two copies cannot drift apart", () => {
    // It was repeated per selector before the inner panels were added, and
    // a data URI edited in three places ends up different in three places.
    const tiles = section.match(/url\("data:image\/svg\+xml/g) ?? [];
    expect(tiles).toHaveLength(2); // one light, one dark
    expect((section.match(/var\(--festive-flakes\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
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

describe("the festive snow colour", () => {
  const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
  const snow = css.slice(
    css.indexOf("── Christmas snow"),
    css.indexOf("── Christmas card stock"),
  );

  it("gives light and dark their own flake colour", () => {
    // White snow on a white page is not snow, it is nothing. Light mode
    // gets a blue-grey, which is how snow is drawn against a pale sky for
    // exactly this reason.
    expect(snow).toMatch(/\.festive\s*\{[^}]*--festive-flake:/);
    expect(snow).toMatch(/\.dark\.festive\s*\{[^}]*--festive-flake:/);
  });

  it("does not leave the light-mode flake white", () => {
    const light = /\.festive\s*\{[^}]*--festive-flake:\s*(#[0-9a-fA-F]{3,6})/.exec(snow);
    expect(light).not.toBeNull();
    expect(light![1].toLowerCase()).not.toMatch(/^#f{3,6}$/);
  });

  it("animates transform and opacity only, so it composites on the GPU", () => {
    // Animating `top` would re-lay-out the page forty times a frame on
    // the machine driving the salon TV.
    expect(snow).toContain("translate3d");
    expect(snow).not.toMatch(/@keyframes festive-snowfall\s*\{[^}]*\btop:/);
  });

  it("is taken down entirely under prefers-reduced-motion", () => {
    // Full-screen falling movement is exactly what that setting exists to
    // avoid, and there is no information in it to preserve.
    const at = snow.indexOf("prefers-reduced-motion");
    expect(at).toBeGreaterThan(-1);
    const block = snow.slice(at);
    expect(block).toContain(".festive-snow");
    expect(block).toMatch(/display:\s*none/);
  });
});
