import { describe, expect, it } from "vitest";
import { groomerTakesOnlineStart, normaliseStartTimes, parseStartTimes } from "@shared/groomerOnlineHours";

// 27/11/2026 is a Friday. Brisbane is UTC+10 all year.
const at = (hhmm: string) => new Date(`2026-11-27T${hhmm}:00+10:00`);

describe("normaliseStartTimes", () => {
  it("reads the ways Lauren writes times", () => {
    expect(normaliseStartTimes(["11", "12", "12:30", "1pm"])).toEqual(["11:00", "12:00", "12:30", "13:00"]);
  });
  it("sorts, de-duplicates and drops what it cannot read", () => {
    expect(normaliseStartTimes(["13:00", "9:30", "13:00", "lunch", "25:00", ""])).toEqual(["09:30", "13:00"]);
  });
  it("treats 12am as midnight and 12pm as noon", () => {
    expect(normaliseStartTimes(["12pm", "12am"])).toEqual(["00:00", "12:00"]);
  });
});

describe("parseStartTimes", () => {
  it("is null (no limit) for nothing, an empty list or junk", () => {
    expect(parseStartTimes(null)).toBeNull();
    expect(parseStartTimes("[]")).toBeNull();
    expect(parseStartTimes("not json")).toBeNull();
    expect(parseStartTimes('{"a":1}')).toBeNull();
  });
  it("reads a stored list", () => {
    expect(parseStartTimes('["12:30","11:00"]')).toEqual(["11:00", "12:30"]);
  });
});

describe("groomerTakesOnlineStart", () => {
  const lauren = JSON.stringify(["11:00", "12:00", "12:30", "13:00"]);
  const ash = JSON.stringify(["08:00", "08:30", "09:00", "09:30", "11:00", "11:30", "12:00", "12:30"]);

  it("lets a groomer with no list take every start", () => {
    expect(groomerTakesOnlineStart(null, at("08:00"))).toBe(true);
    expect(groomerTakesOnlineStart(null, at("13:00"))).toBe(true);
  });

  it("gives Lauren her four afternoon starts and nothing else", () => {
    expect(["11:00", "12:00", "12:30", "13:00"].map((t) => groomerTakesOnlineStart(lauren, at(t)))).toEqual([true, true, true, true]);
    expect(["08:00", "09:30", "11:30"].map((t) => groomerTakesOnlineStart(lauren, at(t)))).toEqual([false, false, false]);
  });

  it("stops Ash at 12:30", () => {
    expect(groomerTakesOnlineStart(ash, at("12:30"))).toBe(true);
    expect(groomerTakesOnlineStart(ash, at("13:00"))).toBe(false);
  });

  it("reads the time in Brisbane, not the server's zone", () => {
    // 03:00 UTC is 13:00 in Brisbane.
    expect(groomerTakesOnlineStart(lauren, new Date("2026-11-27T03:00:00Z"))).toBe(true);
    expect(groomerTakesOnlineStart(ash, new Date("2026-11-27T03:00:00Z"))).toBe(false);
  });
});
