import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { dateTimeFormat, intlCacheSize, numberFormat } from "@shared/intlCache";
import { dayInZone } from "@shared/calendarDay";

/*
 * The 12:06 outage on 26/11/2026 (shared/intlCache.ts): fresh Intl
 * formatters per row held memory outside the heap until the 2 GB server
 * died. These pin the fix.
 */

describe("intlCache", () => {
  it("hands back the same formatter for the same locale and options", () => {
    const a = dateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric" });
    const b = dateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric" });
    expect(a).toBe(b);
    expect(numberFormat("en-AU", { style: "currency", currency: "AUD" }))
      .toBe(numberFormat("en-AU", { style: "currency", currency: "AUD" }));
  });

  it("formats exactly as a fresh formatter would", () => {
    const at = new Date("2026-11-25T15:30:00Z");
    const options: Intl.DateTimeFormatOptions = { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" };
    expect(dateTimeFormat("en-CA", options).format(at)).toBe(new Intl.DateTimeFormat("en-CA", options).format(at));
    expect(dayInZone(at, "Australia/Brisbane")).toBe("2026-11-26");
  });

  it("does not build a formatter per call in a loop", () => {
    const before = intlCacheSize().dateTime;
    for (let i = 0; i < 5000; i++) dayInZone(new Date(Date.UTC(2026, 0, 1) + i * 3_600_000), "Australia/Brisbane");
    expect(intlCacheSize().dateTime - before).toBeLessThanOrEqual(1);
  });

  it("still throws on a bad time zone, and caches nothing for it", () => {
    const before = intlCacheSize().dateTime;
    expect(() => dateTimeFormat("en-CA", { timeZone: "Not/AZone" })).toThrow();
    expect(intlCacheSize().dateTime).toBe(before);
  });
});

describe("no fresh Intl formatters in server or shared code", () => {
  // Structural, and only to prove delegation: every formatter goes through
  // shared/intlCache.ts. Client code runs in a browser per user and is not
  // covered.
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
      return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
    });
  }

  it("finds none outside intlCache.ts", () => {
    const offenders = [...sources("server"), ...sources("shared")]
      .filter((file) => !file.endsWith("intlCache.ts"))
      .filter((file) => /new Intl\.(DateTimeFormat|NumberFormat)\(/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
