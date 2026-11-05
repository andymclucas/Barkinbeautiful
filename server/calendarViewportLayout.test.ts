import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * These read Calendar.tsx as text, which CLAUDE.md §7 rightly calls out as a
 * weak kind of test: they assert formatting, not behaviour, and they break on
 * any refactor while the app still works.
 *
 * They are kept because there is no jsdom environment yet and the thing being
 * guarded is real - on 30/09/2026 the day view could not be scrolled at all.
 * But they are now written to assert the PROPERTY that matters (each flex
 * ancestor can shrink) rather than one exact class string, and the last
 * version of this file actively held the bug in place: it required
 * `className="overflow-y-auto flex-1"`, which was the broken markup, so fixing
 * the scroll turned the suite red.
 *
 * Replace these with a real jsdom test the moment that environment exists.
 */
const source = () => readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");

describe("Appointments day viewport layout", () => {
  it("uses the available large-screen viewport below the dashboard padding", () => {
    const src = source();
    // Not the exact constant: it has to change whenever the chrome above the
    // page changes, and pinning it means adding a top bar turns the suite red
    // for no reason. What matters is that the page is a shrinkable flex
    // column sized to the viewport minus that chrome.
    expect(src).toMatch(/flex min-h-0 flex-col gap-4 lg:h-\[calc\(100dvh-[\d.]+rem\)\]/);
    /*
     * EVERY view fills the viewport, week included.
     *
     * This used to require the ternary that excluded week view — and that
     * ternary was the bug. The page column above has a fixed height, so
     * something must absorb a week taller than the screen; with no flex-1
     * the calendar row would not, and flex took the space out of the
     * TOOLBAR instead, spilling its second row onto the mini calendar and
     * pushing the grid over the Unassigned panel.
     *
     * Which is the second time this file has held a layout bug in place by
     * pinning the broken markup — see the note at the top. Asserting the
     * property rather than the string is the whole point of that note.
     */
    expect(src).toContain('<div className="flex min-h-0 flex-1 flex-col">');
    expect(src).not.toContain('viewMode !== "week" ? "flex min-h-0 flex-1 flex-col"');
  });

  it("keeps the day card flexible and confines overflow to the staff calendar grid", () => {
    const src = source();
    expect(src).toContain("min-h-[500px] flex-1");
    expect(src).toContain("lg:min-h-0");
    expect(src).toContain("overflow-x-auto overscroll-x-contain flex-1 flex flex-col");
  });

  it("sizes calendar cells explicitly, never from a ratio of their own width", () => {
    // The day cells used to take their height from `aspect-square` over a
    // fluid `w-full`, plus `h-full` - a percentage of a parent with no
    // definite height. Chromium absorbs that by growing the container;
    // WebKit does not, so the last week of the month drew outside its card
    // in Safari while looking perfect in Chrome. Reported four times before
    // the cause was found, twice after I declared it fixed from Chromium
    // alone.
    //
    // Asserting the property, not the pixel count: every cell dimension is a
    // straight multiple of --cell-size, so there is nothing for a layout
    // engine to interpret differently.
    const calendar = readFileSync(new URL("../client/src/components/ui/calendar.tsx", import.meta.url), "utf8");
    const dayLine = /day: cn\(\s*\n?\s*"([^"]*)"/.exec(calendar.slice(calendar.indexOf("day: cn(")));
    expect(dayLine, "the day cell class list should still be findable").not.toBeNull();
    expect(dayLine![1]).toContain("size-(--cell-size)");
    expect(dayLine![1]).not.toContain("aspect-square");
    expect(dayLine![1]).not.toContain("h-full");
    // The button inside the cell must not reintroduce the ratio either.
    expect(calendar).toContain("size-(--cell-size) aspect-auto");
    expect(calendar).not.toContain("aspect-square size-auto w-full");

    // And the rail pins a cell size rather than leaving it to the default.
    const sidebar = readFileSync(new URL("../client/src/components/CalendarSidebar.tsx", import.meta.url), "utf8");
    expect(sidebar).toMatch(/style=\{\{\s*"--cell-size":\s*"\d+px"/);
  });

  it("puts the persistent sidebar beside the grid, not above it", () => {
    // The month used to exist only inside a popover. The rail carries the
    // month, Quick Jump and the day's figures, and must sit alongside the
    // calendar rather than stacking above it and stealing vertical space.
    const src = source();
    expect(src).toContain("<CalendarSidebar");
    expect(src).toContain("summary={sidebarSummary}");
    // One class list for every view. The week-only variant dropped flex-1,
    // which is what let the toolbar be squeezed into the sidebar.
    expect(src).toContain('<div className="flex min-h-0 flex-1 gap-4">');
  });

  it("gives the grid body a bounded height so it scrolls itself", () => {
    // The scroller must be able to shrink below its content. Without min-h-0 a
    // flex child sizes to its content, the horizontal wrapper absorbs the
    // overflow, and the whole grid moves together with its headers.
    const src = source();
    // Tolerant of other attributes between the class list and the ref —
    // pinning their ORDER is pinning formatting, and it turned red on
    // 05/11/2026 for a touch-action added between the two while the
    // property this test exists for was untouched.
    const scroller = /className="overflow-y-auto([^"]*)"[^>]*ref=\{scrollRef\}/.exec(src);
    expect(scroller, "the grid body scroller should still carry ref={scrollRef}").not.toBeNull();
    expect(scroller![1]).toContain("min-h-0");
    expect(scroller![1]).toContain("flex-1");
  });

  it("bounds the WEEK grid too, so its overflow-auto means something", () => {
    /*
     * `overflow-auto` on a container with no height constraint never
     * scrolls — it simply grows. Measured on the live page before the fix,
     * the week grid was 3,328px tall inside a 654px row, with
     * scrollHeight === clientHeight: the scroller was not scrolling, it
     * was overflowing, and drawing over everything below it.
     */
    const src = source();
    const weekRoot = /<div className="([^"]*)bg-card rounded-xl border overflow-auto"/.exec(src);
    expect(weekRoot, "the week view root should still be findable").not.toBeNull();
    expect(weekRoot![1]).toContain("min-h-0");
    expect(weekRoot![1]).toContain("flex-1");
  });

  it("wraps the grid in a flex column that may shrink, not a rigid block", () => {
    // Was `<div className="shrink-0" style={{ width: totalWidth ... }}>`: a
    // block gives no flex context to the scroller inside it, and shrink-0 stops
    // it shrinking inside its column parent.
    const src = source();
    expect(src).toContain('<div className="flex min-h-0 flex-1 flex-col" style={{ width: totalWidth');
    expect(src).not.toContain('<div className="shrink-0" style={{ width: totalWidth');
  });
});
