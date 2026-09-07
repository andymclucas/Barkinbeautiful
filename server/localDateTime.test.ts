import { describe, expect, it } from "vitest";
import { parseBrisbaneLocalDateTime } from "../shared/localDateTime";

describe("parseBrisbaneLocalDateTime", () => {
  it("interprets a naive datetime-local string as Brisbane (UTC+10) time", () => {
    // 10:30am Brisbane time on 3 Sept 2026 should be 00:30 UTC the same day.
    const result = parseBrisbaneLocalDateTime("2026-09-03T10:30");
    expect(result.toISOString()).toBe("2026-09-03T00:30:00.000Z");
  });

  it("handles naive strings that include seconds", () => {
    const result = parseBrisbaneLocalDateTime("2026-09-03T10:30:15");
    expect(result.toISOString()).toBe("2026-09-03T00:30:15.000Z");
  });

  it("rolls over correctly for times that cross midnight UTC", () => {
    // 5:00am Brisbane is still the previous UTC day.
    const result = parseBrisbaneLocalDateTime("2026-09-03T05:00");
    expect(result.toISOString()).toBe("2026-09-02T19:00:00.000Z");
  });

  it("does NOT re-shift a fully-qualified UTC ISO string (Z suffix)", () => {
    const input = "2026-09-03T00:30:00.000Z";
    const result = parseBrisbaneLocalDateTime(input);
    expect(result.toISOString()).toBe(input);
  });

  it("does NOT re-shift a fully-qualified ISO string with an explicit offset", () => {
    const result = parseBrisbaneLocalDateTime("2026-09-03T10:30:00+10:00");
    expect(result.toISOString()).toBe("2026-09-03T00:30:00.000Z");
  });

  it("throws a clear error for unparseable input", () => {
    expect(() => parseBrisbaneLocalDateTime("not-a-date")).toThrow();
  });
});
