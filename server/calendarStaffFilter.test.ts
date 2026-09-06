import { describe, expect, it } from "vitest";
import { toggleCalendarStaffSelection } from "../client/src/lib/calendarStaffFilter";

describe("toggleCalendarStaffSelection", () => {
  it("starts from all staff and hides only the explicitly deselected person", () => {
    expect(toggleCalendarStaffSelection(null, [1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("returns to the all-staff mode when every staff member is selected", () => {
    expect(toggleCalendarStaffSelection([1, 3], [1, 2, 3], 2)).toBeNull();
  });
});
