import { describe, it, expect } from "vitest";
import { calendarAppointmentFromSearch, calendarAppointmentHref, calendarDateFromSearch, parseCalendarDay } from "@shared/calendarDeepLink";
import { appointmentHref } from "@shared/globalSearch";

describe("parseCalendarDay", () => {
  it("reads a day as LOCAL midnight, not UTC", () => {
    const d = parseCalendarDay("2026-11-03")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(0);
    /*
     * The bug this guards. `new Date("2026-11-03")` is midnight UTC,
     * which on any machine behind UTC is the 2nd — the diary would open
     * a day early with nothing explaining it.
     */
    expect(d.getDate()).not.toBe(new Date("2026-11-03").getUTCDate() - 1);
  });

  it("rejects a day that does not exist rather than rolling it forward", () => {
    // new Date(2026, 1, 31) is 3 March.
    expect(parseCalendarDay("2026-02-31")).toBeNull();
    expect(parseCalendarDay("2026-13-01")).toBeNull();
    expect(parseCalendarDay("2026-00-10")).toBeNull();
    expect(parseCalendarDay("2026-11-00")).toBeNull();
  });

  it("accepts a real leap day and rejects a fake one", () => {
    expect(parseCalendarDay("2028-02-29")).not.toBeNull();
    expect(parseCalendarDay("2026-02-29")).toBeNull();
  });

  it("refuses anything that is not a plain YYYY-MM-DD", () => {
    for (const raw of [
      "", "   ", "today", "2026-11-3", "26-11-03", "2026/11/03",
      "2026-11-03T09:00", "2026-11-03Z", null, undefined,
    ]) {
      expect(parseCalendarDay(raw as string), String(raw)).toBeNull();
    }
    // Surrounding whitespace IS forgiven — it is still the day they
    // meant, and a URL can pick one up.
    expect(parseCalendarDay("  2026-11-03  ")).not.toBeNull();
  });
});

describe("calendarDateFromSearch", () => {
  it("reads the search string with or without its leading ?", () => {
    expect(calendarDateFromSearch("?date=2026-11-03")?.getDate()).toBe(3);
    expect(calendarDateFromSearch("date=2026-11-03")?.getDate()).toBe(3);
  });

  it("finds the date among other parameters", () => {
    expect(calendarDateFromSearch("?view=day&date=2026-11-03&x=1")?.getDate()).toBe(3);
  });

  it("is null when there is nothing to act on", () => {
    for (const search of ["", "?", "?pet=12", null, undefined]) {
      expect(calendarDateFromSearch(search), String(search)).toBeNull();
    }
  });

  /*
   * The two halves have to agree, and for weeks they did not: the
   * search built this link and the calendar never read it, so every
   * result for a future booking opened today's board. Pinned here
   * rather than by eye.
   */
  it("reads exactly what the global search writes", () => {
    const href = appointmentHref("scheduled", "2026-11-03");
    expect(href).toBe("/calendar?date=2026-11-03");
    const day = calendarDateFromSearch(href.slice(href.indexOf("?")))!;
    expect(day.getFullYear()).toBe(2026);
    expect(day.getMonth()).toBe(10);
    expect(day.getDate()).toBe(3);
  });

  /* A dog already on the floor goes to the workflow board instead, and
     that link has no date to read. */
  it("has nothing to read on the workflow link", () => {
    expect(appointmentHref("bathing", "2026-11-03")).toBe("/workflow");
    expect(calendarDateFromSearch("")).toBeNull();
  });
});

describe("linking to one booking on the calendar", () => {
  it("builds a link to the booking's day with the booking itself", () => {
    expect(calendarAppointmentHref(2610018, "2027-01-28")).toBe("/calendar?date=2027-01-28&appt=2610018");
  });

  it("reads the booking back out of the link, with or without the ?", () => {
    expect(calendarAppointmentFromSearch("?date=2027-01-28&appt=2610018")).toBe(2610018);
    expect(calendarAppointmentFromSearch("date=2027-01-28&appt=2610018")).toBe(2610018);
    expect(calendarDateFromSearch("?date=2027-01-28&appt=2610018")?.getDate()).toBe(28);
  });

  it("ignores a missing or nonsense booking id, so the day still opens", () => {
    expect(calendarAppointmentFromSearch("?date=2027-01-28")).toBeNull();
    expect(calendarAppointmentFromSearch("?appt=abc")).toBeNull();
    expect(calendarAppointmentFromSearch("?appt=-4")).toBeNull();
    expect(calendarAppointmentFromSearch("?appt=0")).toBeNull();
    expect(calendarAppointmentFromSearch("")).toBeNull();
  });
});
