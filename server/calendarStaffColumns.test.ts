import { describe, expect, it } from "vitest";
import {
  calendarColumnGroups,
  resolveCalendarStaffColumns,
  withUnassignedColumn,
} from "../client/src/lib/calendarStaffColumns";

describe("resolveCalendarStaffColumns", () => {
  it("uses active configured staff when the staff query is available", () => {
    const columns = resolveCalendarStaffColumns([
      { id: 2, name: "Megs", colourHex: "#059669", isActive: true },
      { id: 9, name: "Former staff", colourHex: "#111111", isActive: false },
    ], []);

    // The fields this function is responsible for, rather than its whole
    // shape: it gained dailyClipCapacity when the calendar started showing
    // clips booked against a groomer's day, and a strict deep-equal here
    // fails on every such addition while the function keeps working.
    expect(columns).toHaveLength(1);
    expect(columns[0]).toMatchObject({ id: 2, name: "Megs", colourHex: "#059669", isActive: true });
  });

  it("recovers assigned columns from appointment joins when the staff query is empty", () => {
    const columns = resolveCalendarStaffColumns([], [
      { staffId: 5, staffName: "Brooklyn", staffColour: "#d97706" },
      { staffId: 2, staffName: "Megs", staffColour: "#059669" },
      { staffId: null, staffName: null, staffColour: null },
    ]);

    expect(columns.map(({ id, name, colourHex }) => ({ id, name, colourHex }))).toEqual([
      { id: 5, name: "Brooklyn", colourHex: "#d97706" },
      { id: 2, name: "Megs", colourHex: "#059669" },
    ]);
  });

  it("adds a missing migrated staff member without duplicating configured columns", () => {
    const columns = resolveCalendarStaffColumns([
      { id: 2, name: "Megs", colourHex: "#059669", isActive: true },
    ], [
      { staffId: 2, staffName: "Megs", staffColour: "#059669" },
      { staffId: 7, staffName: "Steph", staffColour: null },
    ]);

    expect(columns).toHaveLength(2);
    expect(columns.find((column) => column.id === 7)).toMatchObject({
      name: "Steph",
      colourHex: "#6366f1",
    });
  });

  it("places alphabetised groomers before alphabetised bathers", () => {
    const columns = resolveCalendarStaffColumns([
      { id: 8, name: "Sabina", role: "bather", colourHex: "#8b5cf6", isActive: true },
      { id: 3, name: "Charlotte", role: "groomer", colourHex: "#dc2626", isActive: true },
      { id: 7, name: "Steph", role: "bather", colourHex: "#6366f1", isActive: true },
      { id: 2, name: "Megs", role: "groomer", colourHex: "#059669", isActive: true },
    ], []);

    expect(columns.map(({ name }) => name)).toEqual(["Charlotte", "Megs", "Sabina", "Steph"]);
    expect(columns.map(({ role }) => role)).toEqual(["groomer", "groomer", "bather", "bather"]);
  });
});

describe("withUnassignedColumn", () => {
  const MEGS = { id: 2, name: "Megs", colourHex: "#059669", isActive: true, role: "groomer" };
  const STEPH = { id: 5, name: "Stephanie", colourHex: "#2563eb", isActive: true, role: "bather" };

  it("adds a column when the day has a dog with nobody against it", () => {
    // 107 forward bookings sat unassigned, nearly all baths off the MoeGo
    // import. Without a column to match, the day grid drew none of them.
    const cols = withUnassignedColumn([MEGS, STEPH], true);
    expect(cols).toHaveLength(3);
    expect(cols[2]).toMatchObject({ id: null, name: "Unassigned" });
  });

  it("stays out of the way on a day where everything is assigned", () => {
    // An empty grey column on every normal day is its own kind of noise.
    expect(withUnassignedColumn([MEGS, STEPH], false)).toEqual([MEGS, STEPH]);
  });

  it("goes last, after the bathers", () => {
    const cols = withUnassignedColumn([MEGS, STEPH], true);
    expect(cols.map((c) => c.name)).toEqual(["Megs", "Stephanie", "Unassigned"]);
  });

  it("is the whole board when there is no roster at all", () => {
    // The behaviour the day view already had, kept.
    expect(withUnassignedColumn([], false)).toHaveLength(1);
    expect(withUnassignedColumn([], true)).toHaveLength(1);
  });

  it("carries a null id, which is what makes the grid match it", () => {
    // The day grid places a dog with appointment.staffId === column.id. An
    // unassigned dog has a null staffId, so a null column id matches with no
    // special case — and a drop onto it passes null straight through, which
    // unassigns.
    const [col] = withUnassignedColumn([], true);
    expect(col.id).toBeNull();
  });

  it("does not mutate the roster it was given", () => {
    const roster = [MEGS];
    withUnassignedColumn(roster, true);
    expect(roster).toHaveLength(1);
  });
});

describe("calendarColumnGroups", () => {
  const MEGS = { id: 2, name: "Megs", colourHex: "#059669", isActive: true, role: "groomer" };
  const STEPH = { id: 5, name: "Stephanie", colourHex: "#2563eb", isActive: true, role: "bather" };

  it("counts the banner spans so they add up to the columns", () => {
    // The header row uses these as gridColumn spans. If they do not total the
    // column count the banners stop lining up with the board beneath them.
    const cols = withUnassignedColumn([MEGS, STEPH], true);
    const groups = calendarColumnGroups(cols);
    expect(groups).toEqual({ groomers: 1, bathers: 1, unassigned: 1 });
    expect(groups.groomers + groups.bathers + groups.unassigned).toBe(cols.length);
  });

  it("does not file Unassigned under Groomers", () => {
    // It has no role, and "not a bather" would have swept it in with them.
    const groups = calendarColumnGroups(withUnassignedColumn([MEGS], true));
    expect(groups.groomers).toBe(1);
    expect(groups.unassigned).toBe(1);
  });

  it("reports no unassigned group when the column is absent", () => {
    expect(calendarColumnGroups([MEGS, STEPH])).toEqual({ groomers: 1, bathers: 1, unassigned: 0 });
  });
});
