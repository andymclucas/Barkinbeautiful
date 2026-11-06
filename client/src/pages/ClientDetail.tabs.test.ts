import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cn } from "@/lib/utils";

/**
 * The client record's tab rail, as the browser actually receives it.
 *
 * Not a source grep: it takes the class list out of the page, puts it
 * through the real `cn()` against the real shadcn base, and asserts the
 * RESULT. What goes wrong here is not which classes are written down, it
 * is which ones survive tailwind-merge — and that is invisible from
 * reading either half.
 *
 * Andy, 06/11/2026: "Alignment is off for client card on mobile." The
 * rail is a vertical list on lg and a wrapped row on a phone, and the
 * shadcn base is built for neither: it assumes a single-row strip of
 * equal-width tabs.
 */
const SHADCN_TRIGGER_BASE =
  "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring "
  + "text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center "
  + "justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap";

function railTriggerClasses(): string[] {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");
  const match = /className="(h-auto flex-none[^"]*)"/.exec(source);
  if (!match) throw new Error("the client record's tab trigger classes should still be findable");
  return cn(SHADCN_TRIGGER_BASE, match[1]).split(" ");
}

describe("the client record tab rail on a phone", () => {
  it("drops the base's flex-1, which is what broke the alignment", () => {
    /*
     * `flex-1` is flex-basis:0, so on a phone each wrapped row divided
     * its width between however many tabs happened to fit — three on one
     * line, two on the next, every row a different size, and the active
     * pill stretched to whatever slot it landed in.
     *
     * The `w-full` that used to be here was meant to prevent exactly
     * that and could not: flex-basis beats width. Reproduced against the
     * deployed stylesheet at 375px before changing anything.
     */
    expect(railTriggerClasses()).not.toContain("flex-1");
    expect(railTriggerClasses()).toContain("flex-none");
  });

  it("drops the base's percentage height", () => {
    // h-[calc(100%-1px)] is a percentage of a container that is h-auto,
    // which has nothing to resolve against once the row wraps.
    expect(railTriggerClasses()).not.toContain("h-[calc(100%-1px)]");
    expect(railTriggerClasses()).toContain("h-auto");
  });

  it("is a natural-width chip on a phone and a full-width row on lg", () => {
    // Ten full-width rows on a phone would push the record itself off the
    // bottom of the screen; in the lg column the rail IS a vertical list.
    const classes = railTriggerClasses();
    expect(classes).toContain("w-auto");
    expect(classes).toContain("lg:w-full");
  });

  it("reads left-aligned rather than centred", () => {
    // The base centres, which is right for an equal-width strip and wrong
    // for a list of labels of different lengths.
    const classes = railTriggerClasses();
    expect(classes).toContain("justify-start");
    expect(classes).not.toContain("justify-center");
  });
});
