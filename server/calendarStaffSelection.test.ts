import { describe, expect, it } from "vitest";
import {
  calendarStaffFilterKey,
  coversAllStaff,
  DEFAULT_CALENDAR_STAFF_SELECTION,
  describeCalendarStaffSelection,
  isBatherRole,
  parseCalendarStaffSelection,
  serialiseCalendarStaffSelection,
  splitCalendarStaff,
  toggleCalendarStaff,
  visibleStaffIds,
  type CalendarStaffSelection,
} from "@shared/calendarStaffSelection";

/** The real shape of the salon: owner + 2 managers + 5 groomers, 4 bathers. */
const SALON = [
  { id: 1, role: "owner" },
  { id: 2, role: "manager" },
  { id: 3, role: "manager" },
  { id: 4, role: "groomer" },
  { id: 5, role: "groomer" },
  { id: 6, role: "groomer" },
  { id: 7, role: "groomer" },
  { id: 8, role: "groomer" },
  { id: 20, role: "bather" },
  { id: 21, role: "bather" },
  { id: 22, role: "bather" },
  { id: 23, role: "bather" },
];
const GROOMER_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
const ALL_IDS = [...GROOMER_IDS, 20, 21, 22, 23];

describe("isBatherRole", () => {
  it("is the only place the grooming/bathing line is drawn", () => {
    expect(isBatherRole("bather")).toBe(true);
    expect(isBatherRole("Bather")).toBe(true);
    expect(isBatherRole(" bather ")).toBe(true);
  });

  it("puts everyone who takes a dog for a groom on the grooming side", () => {
    for (const role of ["owner", "manager", "groomer", "receptionist", null, undefined, ""]) {
      expect(isBatherRole(role)).toBe(false);
    }
  });
});

describe("the default", () => {
  it("is the grooming side, not everybody", () => {
    expect(DEFAULT_CALENDAR_STAFF_SELECTION).toEqual({ kind: "groomers" });
    expect(visibleStaffIds(DEFAULT_CALENDAR_STAFF_SELECTION, SALON)).toEqual(GROOMER_IDS);
  });

  it("shows a groomer hired tomorrow without anyone touching the filter", () => {
    // The whole reason this is an intent and not a list of ids. A stored
    // eight-id list would hide her on her first morning.
    const withNewHire = [...SALON, { id: 99, role: "groomer" }];
    expect(visibleStaffIds(DEFAULT_CALENDAR_STAFF_SELECTION, withNewHire)).toContain(99);
  });

  it("keeps a bather hired tomorrow hidden, because bathers are opt-in", () => {
    const withNewBather = [...SALON, { id: 98, role: "bather" }];
    expect(visibleStaffIds(DEFAULT_CALENDAR_STAFF_SELECTION, withNewBather)).not.toContain(98);
  });
});

describe("visibleStaffIds", () => {
  it("resolves all to everyone", () => {
    expect(visibleStaffIds({ kind: "all" }, SALON)).toEqual(ALL_IDS);
  });

  it("drops ids belonging to people who have left", () => {
    expect(visibleStaffIds({ kind: "ids", ids: [4, 777] }, SALON)).toEqual([4]);
  });

  it("is empty, not everyone, when the staff list has not arrived", () => {
    // Returning everyone here would flash every column before the filter
    // applied; returning nothing renders an empty board for one tick.
    expect(visibleStaffIds({ kind: "groomers" }, undefined)).toEqual([]);
    expect(visibleStaffIds({ kind: "all" }, undefined)).toEqual([]);
  });
});

describe("toggleCalendarStaff", () => {
  it("adds one bather to the default without losing the groomers", () => {
    // Exactly what Lauren does: open the diary, add the bather she needs.
    const next = toggleCalendarStaff(DEFAULT_CALENDAR_STAFF_SELECTION, SALON, 20);
    expect(next).toEqual({ kind: "ids", ids: [...GROOMER_IDS, 20] });
    expect(visibleStaffIds(next, SALON)).toEqual([...GROOMER_IDS, 20]);
  });

  it("collapses back to the groomers intent when the last bather is removed", () => {
    // Not an eight-id list, or the next hire would be invisible.
    const withBather: CalendarStaffSelection = { kind: "ids", ids: [...GROOMER_IDS, 20] };
    expect(toggleCalendarStaff(withBather, SALON, 20)).toEqual({ kind: "groomers" });
  });

  it("collapses to all when every box ends up ticked", () => {
    const nearlyAll: CalendarStaffSelection = { kind: "ids", ids: ALL_IDS.filter((id) => id !== 23) };
    expect(toggleCalendarStaff(nearlyAll, SALON, 23)).toEqual({ kind: "all" });
  });

  it("removing a groomer from all leaves an explicit list", () => {
    const next = toggleCalendarStaff({ kind: "all" }, SALON, 4);
    expect(next.kind).toBe("ids");
    expect(visibleStaffIds(next, SALON)).not.toContain(4);
    expect(visibleStaffIds(next, SALON)).toContain(20);
  });

  it("prefers all over groomers when the salon has no bathers", () => {
    // The two describe the same board, and they ticked every box there is.
    const noBathers = [{ id: 1, role: "owner" }, { id: 4, role: "groomer" }];
    expect(toggleCalendarStaff({ kind: "ids", ids: [1] }, noBathers, 4)).toEqual({ kind: "all" });
  });

  it("lets the board be emptied, one tick at a time", () => {
    let selection: CalendarStaffSelection = { kind: "ids", ids: [4] };
    selection = toggleCalendarStaff(selection, SALON, 4);
    expect(visibleStaffIds(selection, SALON)).toEqual([]);
  });
});

describe("round-tripping through storage", () => {
  const roundTrip = (s: CalendarStaffSelection) =>
    parseCalendarStaffSelection(serialiseCalendarStaffSelection(s), SALON);

  it("survives each kind unchanged", () => {
    expect(roundTrip({ kind: "groomers" })).toEqual({ kind: "groomers" });
    expect(roundTrip({ kind: "all" })).toEqual({ kind: "all" });
    expect(roundTrip({ kind: "ids", ids: [4, 20] })).toEqual({ kind: "ids", ids: [4, 20] });
  });

  it("opens on the grooming side when nothing is stored", () => {
    for (const raw of [null, undefined, ""]) {
      expect(parseCalendarStaffSelection(raw, SALON)).toEqual({ kind: "groomers" });
    }
  });

  it("honours a deliberate all", () => {
    expect(parseCalendarStaffSelection("all", SALON)).toEqual({ kind: "all" });
  });

  it("falls back to the grooming side rather than an empty diary", () => {
    // Everyone in the stored list has left. An empty board reads as the
    // calendar having broken, which is worse than ignoring the preference.
    expect(parseCalendarStaffSelection("[901,902]", SALON)).toEqual({ kind: "groomers" });
    expect(parseCalendarStaffSelection("[]", SALON)).toEqual({ kind: "groomers" });
  });

  it("falls back on nonsense instead of throwing", () => {
    for (const raw of ["{", "null", '"all staff"', "17", '{"kind":"all"}']) {
      expect(parseCalendarStaffSelection(raw, SALON)).toEqual({ kind: "groomers" });
    }
  });

  it("re-reads a stored full list as the all intent", () => {
    // So a hire still shows up for somebody who ticked every box by hand.
    expect(parseCalendarStaffSelection(JSON.stringify(ALL_IDS), SALON)).toEqual({ kind: "all" });
  });

  it("re-reads a stored groomer list as the groomers intent", () => {
    expect(parseCalendarStaffSelection(JSON.stringify(GROOMER_IDS), SALON)).toEqual({ kind: "groomers" });
  });

  it("ignores ids that are not numbers", () => {
    expect(parseCalendarStaffSelection('[4,"5",null,20]', SALON)).toEqual({ kind: "ids", ids: [4, 20] });
  });
});

describe("describeCalendarStaffSelection", () => {
  it("names the default", () => {
    expect(describeCalendarStaffSelection({ kind: "groomers" }, SALON)).toBe("Groomers");
  });

  it("says all staff when everyone is on", () => {
    expect(describeCalendarStaffSelection({ kind: "all" }, SALON)).toBe("All staff");
  });

  it("says all staff for the groomers intent when there are no bathers", () => {
    const noBathers = [{ id: 1, role: "owner" }, { id: 4, role: "groomer" }];
    expect(describeCalendarStaffSelection({ kind: "groomers" }, noBathers)).toBe("All staff");
  });

  it("counts an explicit selection", () => {
    expect(describeCalendarStaffSelection({ kind: "ids", ids: [4, 20] }, SALON)).toBe("2 staff selected");
  });

  it("says so when the board has been emptied", () => {
    expect(describeCalendarStaffSelection({ kind: "ids", ids: [] }, SALON)).toBe("No staff selected");
  });
});

describe("coversAllStaff", () => {
  it("ticks the all row only when the board really is everybody", () => {
    expect(coversAllStaff({ kind: "all" }, SALON)).toBe(true);
    expect(coversAllStaff({ kind: "groomers" }, SALON)).toBe(false);
    expect(coversAllStaff({ kind: "ids", ids: ALL_IDS }, SALON)).toBe(true);
  });

  it("ticks it for the groomers intent when nobody bathes", () => {
    expect(coversAllStaff({ kind: "groomers" }, [{ id: 1, role: "groomer" }])).toBe(true);
  });

  it("is false before the staff list arrives, rather than claiming everybody", () => {
    expect(coversAllStaff({ kind: "all" }, [])).toBe(false);
  });
});

describe("splitCalendarStaff", () => {
  it("groups the way the staff menu's headings do", () => {
    const { groomers, bathers } = splitCalendarStaff(SALON);
    expect(groomers.map((m) => m.id)).toEqual(GROOMER_IDS);
    expect(bathers.map((m) => m.id)).toEqual([20, 21, 22, 23]);
  });

  it("copes with no staff at all", () => {
    expect(splitCalendarStaff(undefined)).toEqual({ groomers: [], bathers: [] });
  });
});

describe("calendarStaffFilterKey", () => {
  it("is per user, so a shared machine does not leak a filter", () => {
    expect(calendarStaffFilterKey(7)).not.toBe(calendarStaffFilterKey(8));
  });

  it("is versioned away from the old key, which saved all unconditionally", () => {
    expect(calendarStaffFilterKey(7)).toContain("_v2_");
    expect(calendarStaffFilterKey(7)).not.toBe("groomigo_calendar_staff_7");
  });

  it("still gives a signed-out reader a key", () => {
    expect(calendarStaffFilterKey(null)).toContain("anon");
  });
});
