import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cn } from "@/lib/utils";

/**
 * The client record's tab rail, as the browser actually receives it.
 *
 * Not a source grep: it takes the class lists out of the page, puts them
 * through the real `cn()` against the real shadcn base, and asserts the
 * RESULT. What goes wrong here is not which classes are written down, it
 * is which ones survive tailwind-merge — and that is invisible from
 * reading either half.
 *
 * Andy, 06/11/2026: "Alignment is off for client card on mobile."
 * Andy, 09/11/2026: "Alignment is a bit off on these tabs. Maybe more of
 * a centralised look with highlighted tabs able to be selected."
 *
 * The rail is a vertical list on lg and a block of chips on a phone, and
 * the shadcn base is built for neither: it assumes a single-row strip of
 * equal-width tabs.
 */
const SHADCN_TRIGGER_BASE =
  "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring "
  + "text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center "
  + "justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap";

const SHADCN_LIST_BASE =
  "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]";

const SOURCE = () =>
  readFileSync(resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");

/**
 * Found by a class only this element carries, rather than by the first
 * few classes in order. The previous version anchored on the literal
 * opening of the string and stopped matching the moment the order
 * changed, which fails as "should still be findable" and says nothing
 * about what actually moved.
 */
function railTriggerClasses(): string[] {
  const match = /className="([^"]*lg:justify-start[^"]*)"/.exec(SOURCE());
  if (!match) throw new Error("the rail's tab trigger classes should still be findable");
  return cn(SHADCN_TRIGGER_BASE, match[1]).split(" ");
}

function railListClasses(): string[] {
  const match = /className="(tabs-rail[^"]*)"/.exec(SOURCE());
  if (!match) throw new Error("the rail's TabsList classes should still be findable");
  return cn(SHADCN_LIST_BASE, match[1]).split(" ");
}

describe("the client record tab rail on a phone", () => {
  it("drops the base's flex-1, which is what broke the alignment", () => {
    /*
     * `flex-1` is flex-basis:0. It is inert inside the grid on a phone,
     * but from lg the rail is a flex COLUMN, and there flex-basis:0 makes
     * all ten items stretch to share the column's height.
     */
    expect(railTriggerClasses()).not.toContain("flex-1");
    expect(railTriggerClasses()).toContain("flex-none");
  });

  it("drops the base's percentage height", () => {
    // h-[calc(100%-1px)] is a percentage of a container that is h-auto,
    // which has nothing to resolve against.
    expect(railTriggerClasses()).not.toContain("h-[calc(100%-1px)]");
    expect(railTriggerClasses()).toContain("h-auto");
  });

  it("fills its cell rather than taking its label's width", () => {
    /*
     * The chips used to be natural-width and wrap, which is what left the
     * ragged right-hand edge: ten labels of ten different lengths fell
     * 2/2/2/2/2 with a gap of between 26 and 119px at the end of each
     * row, measured at 375px. In the grid every chip fills its column, so
     * all ten are the same width and no row ends early.
     */
    const classes = railTriggerClasses();
    expect(classes).toContain("w-full");
    expect(classes).not.toContain("w-auto");
  });

  it("centres the label on a phone and left-aligns it on the rail", () => {
    // Andy, 09/11/2026: "more of a centralised look". At lg the rail is a
    // vertical list, where ten centred labels of different lengths would
    // have no common edge to read down.
    const classes = railTriggerClasses();
    expect(classes).toContain("justify-center");
    expect(classes).toContain("lg:justify-start");
  });

  it("keeps the padding that stops the longest label truncating", () => {
    /*
     * At 375px the two-column cell is 164px and "Memberships (2)" wants
     * 115 of the 114 that px-3 leaves it — truncated by one pixel. px-2
     * gives every label room, including three-digit counts, and lg:px-3
     * puts the original padding back where there is width for it.
     */
    const classes = railTriggerClasses();
    expect(classes).toContain("px-2");
    expect(classes).toContain("lg:px-3");
    expect(classes).not.toContain("px-3");
  });
});

describe("the rail's list survives tailwind-merge", () => {
  /*
   * This half exists because of a mistake made while building the change.
   *
   * A harness that pasted the base and the page's classes together with a
   * space, rather than through cn(), rendered every chip 333px wide on
   * one overflowing line: `inline-flex` from the base and `grid` from the
   * page are both display utilities, and with both present the stylesheet
   * decides by source order, not by which was written last. tailwind-merge
   * is the only reason `grid` wins in the real page.
   */
  it("becomes a grid, not the base's inline-flex", () => {
    const classes = railListClasses();
    expect(classes).toContain("grid");
    expect(classes).not.toContain("inline-flex");
  });

  it("drops the base's fixed height and fit width", () => {
    const classes = railListClasses();
    expect(classes).not.toContain("h-9");
    expect(classes).not.toContain("w-fit");
    expect(classes).toContain("h-auto");
    expect(classes).toContain("w-full");
  });

  it("is one column on a narrow phone and two above it", () => {
    /*
     * Two columns at 320px leave a 136px chip, and "Memberships (12)"
     * needs 122 of it before the icon and the padding. 360 is where the
     * arithmetic changes, not a device.
     */
    const classes = railListClasses();
    expect(classes).toContain("grid-cols-1");
    expect(classes).toContain("min-[360px]:grid-cols-2");
  });

  it("goes back to a flex column on lg", () => {
    const classes = railListClasses();
    expect(classes).toContain("lg:flex");
    expect(classes).toContain("lg:flex-col");
  });
});
