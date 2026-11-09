import { describe, it, expect } from "vitest";
import {
  CALENDAR_WEEK_DAYS, calendarTextLabel, calendarTextRange, canSendMassText,
} from "@shared/calendarMassText";
import { validateAudience, describeAudience } from "@shared/massTextRecipients";

/**
 * Texting everybody booked on the day on screen.
 *
 * Lauren, 09/11/2026, with the diary open on Friday 13 November: "Is
 * there a way to text this days clients to let them know we are closing
 * at 12:30pm early that day... or do I need to do it manually to each
 * one?" And: "would be handy - I had to do this when we had the
 * cyclone.. bulk text for random days."
 */
describe("calendarTextRange", () => {
  it("texts exactly the day being shown", () => {
    for (const viewMode of ["day", "agenda"] as const) {
      expect(calendarTextRange({
        viewMode, dayKey: "2026-11-13", weekStartKey: "2026-11-09",
      }), viewMode).toEqual({ from: "2026-11-13", to: "2026-11-13" });
    }
  });

  /*
   * Monday plus SIX is Sunday. Adding the full seven reaches the next
   * Monday and texts a day nobody was looking at — with no undo, and
   * costing the salon a segment per recipient.
   */
  it("texts Monday to Sunday in week view, not eight days", () => {
    const range = calendarTextRange({
      viewMode: "week", dayKey: "2026-11-13", weekStartKey: "2026-11-09",
    });
    expect(range).toEqual({ from: "2026-11-09", to: "2026-11-15" });
  });

  it("covers exactly a week's worth of days", () => {
    const { from, to } = calendarTextRange({
      viewMode: "week", dayKey: "2026-11-13", weekStartKey: "2026-11-09",
    });
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
    expect(days).toBe(CALENDAR_WEEK_DAYS);
  });

  it("carries a week across the end of a month", () => {
    expect(calendarTextRange({
      viewMode: "week", dayKey: "2026-11-30", weekStartKey: "2026-11-30",
    })).toEqual({ from: "2026-11-30", to: "2026-12-06" });
  });

  it("carries a week across the end of a year", () => {
    expect(calendarTextRange({
      viewMode: "week", dayKey: "2026-12-28", weekStartKey: "2026-12-28",
    })).toEqual({ from: "2026-12-28", to: "2027-01-03" });
  });

  it("carries a week across a leap day", () => {
    expect(calendarTextRange({
      viewMode: "week", dayKey: "2028-02-28", weekStartKey: "2028-02-28",
    })).toEqual({ from: "2028-02-28", to: "2028-03-05" });
  });

  /*
   * The point of the whole thing: what comes out of here has to be
   * something the mass-text audience accepts, or the button opens a
   * dialog that refuses to count anybody.
   */
  it("produces an audience the sender can actually use", () => {
    for (const viewMode of ["day", "week", "agenda"] as const) {
      const range = calendarTextRange({
        viewMode, dayKey: "2026-11-13", weekStartKey: "2026-11-09",
      });
      const validated = validateAudience({ kind: "booked_between", ...range });
      expect(validated.ok, viewMode).toBe(true);
      if (validated.ok) {
        expect(describeAudience(validated.audience)).toContain(range.from);
      }
    }
  });
});

describe("calendarTextLabel", () => {
  it("says what it will actually do", () => {
    expect(calendarTextLabel("day")).toBe("Text the day");
    expect(calendarTextLabel("agenda")).toBe("Text the day");
    expect(calendarTextLabel("week")).toBe("Text the week");
  });
});

/**
 * One rule for two screens. It was two lines inside Messages, and
 * copying them into the calendar is the shape CLAUDE.md §7 describes —
 * a restricted-staff list that existed in three places with one pinned.
 */
describe("canSendMassText", () => {
  const administrator = { id: 30001, email: "mclucas.andy@gmail.com" };
  const grantWith = (sections: string[]) => ({ isAdmin: true, adminSections: JSON.stringify(sections) });

  it("lets a staff administrator send", () => {
    expect(canSendMassText(administrator, null)).toBe(true);
  });

  it("lets a staff member with the mass_text section send", () => {
    expect(canSendMassText(null, grantWith(["mass_text"]) as any)).toBe(true);
  });

  it("refuses a groomer with no grant at all", () => {
    expect(canSendMassText(null, null)).toBe(false);
    expect(canSendMassText({ id: 7, email: "groomer@example.com" }, null)).toBe(false);
  });

  /* Rights are granted and THEN the sections are ticked. Admin rights
     with nothing ticked changes nothing — the safe reading of a
     half-finished grant. */
  it("refuses admin rights with the section not ticked", () => {
    expect(canSendMassText(null, grantWith(["calendar"]) as any)).toBe(false);
    expect(canSendMassText(null, { isAdmin: false, adminSections: JSON.stringify(["mass_text"]) } as any)).toBe(false);
  });
});
