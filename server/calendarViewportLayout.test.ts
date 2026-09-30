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
    expect(src).toContain("flex min-h-0 flex-col gap-4 lg:h-[calc(100dvh-2rem)]");
    expect(src).toContain('viewMode === "day" ? "flex min-h-0 flex-1 flex-col" : "min-h-0"');
  });

  it("keeps the day card flexible and confines overflow to the staff calendar grid", () => {
    const src = source();
    expect(src).toContain("min-h-[500px] flex-1");
    expect(src).toContain("lg:min-h-0");
    expect(src).toContain("overflow-x-auto overscroll-x-contain flex-1 flex flex-col");
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
