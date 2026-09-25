import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  formatAestDate,
  formatAestDateTime,
  formatAestTime,
  isValidTimeZone,
  safeTimeZone,
} from "@shared/auditTimestamp";

/**
 * Users pick a timezone when they set up their account, and every time in the
 * app renders in it. These are the pure pieces that decision rests on.
 */
describe("user timezone", () => {
  describe("isValidTimeZone", () => {
    it("accepts real IANA zones and rejects anything else", () => {
      for (const zone of ["Australia/Brisbane", "Australia/Perth", "Europe/London", "UTC"]) {
        expect(isValidTimeZone(zone)).toBe(true);
      }
      // A zone reaches the server from a client payload, so it is not trusted.
      for (const bad of ["", null, undefined, "Mars/Olympus_Mons", "AEST", "GMT+10", "'; DROP TABLE users;--"]) {
        expect(isValidTimeZone(bad as string | null | undefined)).toBe(false);
      }
    });
  });

  describe("safeTimeZone", () => {
    it("falls back to Brisbane rather than throwing on a bad zone", () => {
      // A stored zone that Intl rejects must not be able to take a page down:
      // every formatter runs through this.
      expect(safeTimeZone("Mars/Olympus_Mons")).toBe(DEFAULT_TIMEZONE);
      expect(safeTimeZone(null)).toBe(DEFAULT_TIMEZONE);
      expect(safeTimeZone(undefined)).toBe(DEFAULT_TIMEZONE);
      expect(safeTimeZone("")).toBe(DEFAULT_TIMEZONE);
      expect(safeTimeZone("Australia/Perth")).toBe("Australia/Perth");
    });
  });

  describe("formatters honour the zone they are given", () => {
    // 2026-09-25T00:00:00Z — 10:00 in Brisbane, 08:00 in Perth, 01:00 in London.
    const instant = Date.parse("2026-09-25T00:00:00Z");

    it("renders the same instant differently per zone", () => {
      expect(formatAestTime(instant, undefined, "Australia/Brisbane")).toBe("10:00 am");
      expect(formatAestTime(instant, undefined, "Australia/Perth")).toBe("8:00 am");
      expect(formatAestTime(instant, undefined, "Europe/London")).toBe("1:00 am");
      expect(formatAestTime(instant, undefined, "UTC")).toBe("12:00 am");
    });

    it("can roll the date over into another day", () => {
      // 2026-09-25T20:00:00Z is already the 26th in Brisbane but still the 25th
      // in London — the case that makes a shared "today" ambiguous.
      const evening = Date.parse("2026-09-25T20:00:00Z");
      expect(formatAestDate(evening, undefined, "Australia/Brisbane")).toContain("26 Sep");
      expect(formatAestDate(evening, undefined, "Europe/London")).toContain("25 Sep");
    });

    it("defaults to Brisbane when no zone is passed, so untouched call sites are unchanged", () => {
      expect(formatAestTime(instant)).toBe(formatAestTime(instant, undefined, DEFAULT_TIMEZONE));
      expect(formatAestDate(instant)).toBe(formatAestDate(instant, undefined, DEFAULT_TIMEZONE));
      expect(formatAestDateTime(instant)).toBe(formatAestDateTime(instant, undefined, DEFAULT_TIMEZONE));
    });

    it("falls back rather than throwing when handed a bad zone", () => {
      expect(formatAestTime(instant, undefined, "Mars/Olympus_Mons")).toBe(formatAestTime(instant));
    });

    it("still reports unusable timestamps rather than inventing one", () => {
      expect(formatAestTime(null, undefined, "Australia/Perth")).toBe("--");
      expect(formatAestTime("not a date", undefined, "Australia/Perth")).toBe("--");
    });
  });

  describe("the zone abbreviation shown beside a time", () => {
    const abbr = (zone: string, at: string) =>
      new Intl.DateTimeFormat("en-AU", { timeZone: zone, timeZoneName: "short" })
        .formatToParts(new Date(at))
        .find((part) => part.type === "timeZoneName")?.value;

    it("is stable year-round for Brisbane, which has no DST", () => {
      expect(abbr("Australia/Brisbane", "2026-01-15T02:00:00Z")).toBe("AEST");
      expect(abbr("Australia/Brisbane", "2026-07-15T02:00:00Z")).toBe("AEST");
    });

    it("tracks DST for a zone that observes it", () => {
      // Sydney is the reason the label is derived rather than hardcoded: half
      // the year it is not the same as Brisbane's, despite the same offset name.
      expect(abbr("Australia/Sydney", "2026-07-15T02:00:00Z")).toBe("AEST");
      expect(abbr("Australia/Sydney", "2026-01-15T02:00:00Z")).toBe("AEDT");
    });
  });
});
