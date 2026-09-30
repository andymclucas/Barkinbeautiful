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
    // The day view must fill the viewport rather than sizing to content. The
    // exact string moved when the sidebar was added beside the grid, so this
    // asserts the property: in day mode the view container is a shrinkable
    // flex column that grows.
    expect(src).toContain('viewMode === "day" ? "flex min-h-0 flex-1 flex-col"');
  });

  it("keeps the day card flexible and confines overflow to the staff calendar grid", () => {
    const src = source();
    expect(src).toContain("min-h-[500px] flex-1");
    expect(src).toContain("lg:min-h-0");
    expect(src).toContain("overflow-x-auto overscroll-x-contain flex-1 flex flex-col");
  });

  it("puts the persistent sidebar beside the grid, not above it", () => {
    // The month used to exist only inside a popover. The rail carries the
    // month, Quick Jump and the day's figures, and must sit alongside the
    // calendar rather than stacking above it and stealing vertical space.
    const src = source();
    expect(src).toContain("<CalendarSidebar");
    expect(src).toContain("summary={sidebarSummary}");
    expect(src).toContain('viewMode === "day" ? "flex min-h-0 flex-1 gap-4" : "flex min-h-0 gap-4"');
  });

  it("gives the grid body a bounded height so it scrolls itself", () => {
    // The scroller must be able to shrink below its content. Without min-h-0 a
    // flex child sizes to its content, the horizontal wrapper absorbs the
    // overflow, and the whole grid moves together with its headers.
    const src = source();
    const scroller = /className="overflow-y-auto([^"]*)" ref=\{scrollRef\}/.exec(src);
    expect(scroller, "the grid body scroller should still carry ref={scrollRef}").not.toBeNull();
    expect(scroller![1]).toContain("min-h-0");
    expect(scroller![1]).toContain("flex-1");
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
