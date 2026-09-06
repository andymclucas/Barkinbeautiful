import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("mobile client search scrolling", () => {
  const calendarSource = readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");

  it("uses a bounded, touch-scrollable client result list inside the New Appointment popover", () => {
    expect(calendarSource).toContain('data-testid="mobile-client-search-results"');
    expect(calendarSource).toContain("max-h-[min(52dvh,20rem)] overflow-y-auto overscroll-contain touch-pan-y");
    expect(calendarSource).toContain('WebkitOverflowScrolling: "touch"');
    expect(calendarSource).toContain('role="listbox"');
    expect(calendarSource).toContain('role="option"');
  });

  it("lets staff clear a mobile customer search without closing the appointment form", () => {
    expect(calendarSource).toContain('aria-label="Clear customer search"');
    expect(calendarSource).toContain('onClick={() => setClientSearch("")}');
    expect(calendarSource).toContain('title="Clear search"');
  });
});
