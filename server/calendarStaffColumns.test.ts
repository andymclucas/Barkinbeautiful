import { describe, expect, it } from "vitest";
import { resolveCalendarStaffColumns } from "../client/src/lib/calendarStaffColumns";

describe("resolveCalendarStaffColumns", () => {
  it("uses active configured staff when the staff query is available", () => {
    const columns = resolveCalendarStaffColumns([
      { id: 2, name: "Megs", colourHex: "#059669", isActive: true },
      { id: 9, name: "Former staff", colourHex: "#111111", isActive: false },
    ], []);

    expect(columns).toEqual([
      { id: 2, name: "Megs", colourHex: "#059669", isActive: true },
    ]);
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
