import { describe, expect, it } from "vitest";
import {
  toggleCalendarStaffSelection,
  calendarStaffFilterKey,
  serialiseStaffSelection,
  parseStoredStaffSelection,
} from "../client/src/lib/calendarStaffFilter";

describe("toggleCalendarStaffSelection", () => {
  it("starts from all staff and hides only the explicitly deselected person", () => {
    expect(toggleCalendarStaffSelection(null, [1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("returns to the all-staff mode when every staff member is selected", () => {
    expect(toggleCalendarStaffSelection([1, 3], [1, 2, 3], 2)).toBeNull();
  });
});

describe("remembering the choice between visits", () => {
  const SALON = [1, 2, 3, 4];

  it("round-trips a selection", () => {
    const stored = serialiseStaffSelection([1, 3]);
    expect(parseStoredStaffSelection(stored, SALON)).toEqual([1, 3]);
  });

  it("round-trips 'all staff', which is not the same as an empty list", () => {
    const stored = serialiseStaffSelection(null);
    expect(stored).toBe("all");
    expect(parseStoredStaffSelection(stored, SALON)).toBeNull();
  });

  it("shows a new hire instead of hiding them", () => {
    // Stored when the salon had three people; a fourth has since started.
    // "All staff" must stay all staff, or a new groomer would be invisible
    // on a board nobody thought to re-tick.
    expect(parseStoredStaffSelection("all", SALON)).toBeNull();
  });

  it("drops staff who have left", () => {
    expect(parseStoredStaffSelection(JSON.stringify([1, 99]), SALON)).toEqual([1]);
  });

  it("falls back to everybody when every stored id has left", () => {
    // Otherwise the board renders no columns at all and reads as broken.
    expect(parseStoredStaffSelection(JSON.stringify([98, 99]), SALON)).toBeNull();
  });

  it("collapses to 'all' when what remains covers the whole salon", () => {
    // Lauren hid Andy and Christie; both have since gone. What is left is
    // everyone, so the button should say "All staff" and a future hire
    // should appear.
    expect(parseStoredStaffSelection(JSON.stringify([1, 2, 3, 4, 77]), SALON)).toBeNull();
  });

  it("survives nonsense in storage rather than throwing", () => {
    for (const raw of [null, undefined, "", "{]", '"nope"', "42", JSON.stringify({ a: 1 })]) {
      expect(parseStoredStaffSelection(raw, SALON)).toBeNull();
    }
  });

  it("ignores non-numeric entries and duplicates", () => {
    expect(parseStoredStaffSelection(JSON.stringify([1, "2", 1, null, 3]), SALON)).toEqual([1, 3]);
  });

  it("keys storage per user, so a shared salon machine does not leak", () => {
    expect(calendarStaffFilterKey(7)).not.toBe(calendarStaffFilterKey(8));
    expect(calendarStaffFilterKey(null)).toBe(calendarStaffFilterKey(undefined));
  });
});
