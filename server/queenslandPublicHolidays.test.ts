import { describe, expect, it } from "vitest";
import { easterSunday, ekkaWednesday, holidaysOnOpenDays, queenslandPublicHolidays } from "@shared/queenslandPublicHolidays";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dates = (year: number) => queenslandPublicHolidays(year).map((h) => `${h.date} ${h.name}`);

describe("easterSunday", () => {
  it.each([[2024, "2024-03-31"], [2025, "2025-04-20"], [2026, "2026-04-05"], [2027, "2027-03-28"], [2028, "2028-04-16"], [2030, "2030-04-21"]])("%i", (y, want) => {
    expect(iso(easterSunday(y))).toBe(want);
  });
});

describe("ekkaWednesday (published show days)", () => {
  it.each([[2022, "2022-08-10"], [2023, "2023-08-16"], [2024, "2024-08-14"], [2025, "2025-08-13"], [2026, "2026-08-12"], [2027, "2027-08-11"]])("%i", (y, want) => {
    expect(iso(ekkaWednesday(y))).toBe(want);
  });
});

describe("queenslandPublicHolidays", () => {
  it("2026: Anzac on a Saturday gets no Monday, Boxing Day on a Saturday moves to Monday 28th", () => {
    expect(dates(2026)).toEqual([
      "2026-01-01 New Year's Day",
      "2026-01-26 Australia Day",
      "2026-04-03 Good Friday",
      "2026-04-04 Easter Saturday",
      "2026-04-05 Easter Sunday",
      "2026-04-06 Easter Monday",
      "2026-04-25 Anzac Day",
      "2026-05-04 Labour Day",
      "2026-08-12 Ekka show day",
      "2026-10-05 King's Birthday",
      "2026-12-25 Christmas Day",
      "2026-12-26 Boxing Day",
      "2026-12-28 Boxing Day (observed)",
    ]);
  });

  it("2027: Anzac on a Sunday adds the Monday; a weekend Christmas moves to Mon 27 and Tue 28", () => {
    const d = dates(2027);
    expect(d).toContain("2027-04-26 Anzac Day (observed)");
    expect(d).toContain("2027-12-27 Christmas Day (observed)");
    expect(d).toContain("2027-12-28 Boxing Day (observed)");
    expect(d).toContain("2027-01-26 Australia Day");
  });

  it("2022: Christmas on a Sunday moves to Tuesday 27th", () => {
    expect(dates(2022)).toContain("2022-12-27 Christmas Day (observed)");
  });

  it("Australia Day on a weekend is the Monday after, not the 26th", () => {
    // 26 Jan 2025 was a Sunday; Queensland observed Monday 27th.
    expect(dates(2025)).toContain("2025-01-27 Australia Day");
    expect(dates(2025)).not.toContain("2025-01-26 Australia Day");
  });

  it("marks Ekka as Brisbane-area only", () => {
    expect(queenslandPublicHolidays(2027).find((h) => h.name === "Ekka show day")?.brisbaneOnly).toBe(true);
  });
});

describe("holidaysOnOpenDays", () => {
  it("keeps only Tuesday to Friday, across a year boundary", () => {
    expect(holidaysOnOpenDays("2026-11-27", "2027-12-31").map((h) => `${h.date} ${h.name}`)).toEqual([
      "2026-12-25 Christmas Day",
      "2027-01-01 New Year's Day",
      "2027-01-26 Australia Day",
      "2027-03-26 Good Friday",
      "2027-08-11 Ekka show day",
      "2027-12-28 Boxing Day (observed)",
    ]);
  });
});
