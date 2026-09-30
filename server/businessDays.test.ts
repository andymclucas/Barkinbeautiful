import { describe, it, expect } from "vitest";
import {
  brisbaneDate,
  brisbaneWeekday,
  isBrisbaneWeekend,
  nextBrisbaneBusinessDay,
  shouldRetryPayment,
  MAX_PAYMENT_RETRIES,
} from "../shared/businessDays";

// Readable assertions: what Brisbane calls this instant.
const bne = (d: Date) =>
  d.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

describe("brisbaneDate / brisbaneWeekday", () => {
  it("rolls the date at 14:00 UTC, not midnight UTC", () => {
    expect(brisbaneDate(new Date("2026-10-02T13:59:59Z"))).toBe("2026-10-02");
    expect(brisbaneDate(new Date("2026-10-02T14:00:00Z"))).toBe("2026-10-03");
  });

  it("reads the Brisbane weekday, not the server's", () => {
    // Friday 23:30 UTC is already Saturday morning in Brisbane.
    const instant = new Date("2026-10-02T23:30:00Z");
    expect(brisbaneWeekday(instant)).toBe(6); // Saturday
    expect(isBrisbaneWeekend(instant)).toBe(true);
  });

  it("does not call a Brisbane weekday a weekend", () => {
    expect(isBrisbaneWeekend(new Date("2026-10-05T01:00:00Z"))).toBe(false); // Mon 11:00
  });
});

describe("nextBrisbaneBusinessDay", () => {
  it("moves a Brisbane Saturday failure to MONDAY, not Tuesday", () => {
    // Regression. The old helper used the UTC weekday, so this instant - a
    // Saturday morning in Brisbane, still Friday in UTC - advanced to the UTC
    // Saturday, skipped the UTC weekend, and landed on Tuesday in Brisbane.
    const failedAt = new Date("2026-10-02T23:30:00Z"); // Sat 03 Oct 09:30 Brisbane
    expect(bne(failedAt)).toContain("Sat");
    expect(bne(nextBrisbaneBusinessDay(failedAt))).toContain("Mon");
  });

  it("moves Friday to Monday", () => {
    expect(bne(nextBrisbaneBusinessDay(new Date("2026-10-01T23:00:00Z")))).toContain("Mon"); // Fri 02 Oct
  });

  it("moves Sunday to Monday", () => {
    expect(bne(nextBrisbaneBusinessDay(new Date("2026-10-04T02:00:00Z")))).toContain("Mon"); // Sun 04 Oct
  });

  it("moves Monday to Tuesday", () => {
    expect(bne(nextBrisbaneBusinessDay(new Date("2026-10-05T02:00:00Z")))).toContain("Tue");
  });

  it("never lands on a weekend, from any starting instant across a fortnight", () => {
    for (let h = 0; h < 24 * 14; h++) {
      const from = new Date(Date.UTC(2026, 9, 1, h));
      expect(isBrisbaneWeekend(nextBrisbaneBusinessDay(from))).toBe(false);
    }
  });

  it("always lands strictly in the future", () => {
    for (let h = 0; h < 24 * 14; h++) {
      const from = new Date(Date.UTC(2026, 9, 1, h));
      expect(nextBrisbaneBusinessDay(from).getTime()).toBeGreaterThan(from.getTime());
    }
  });

  it("lands at 09:00 Brisbane, not at whatever time the failure happened", () => {
    // A retry scheduled for 23:30 is one nobody sees.
    const out = nextBrisbaneBusinessDay(new Date("2026-10-05T13:30:00Z")); // Mon 23:30 Brisbane
    expect(bne(out)).toContain("09:00");
  });

  it("honours a different hour when asked", () => {
    expect(bne(nextBrisbaneBusinessDay(new Date("2026-10-05T02:00:00Z"), 14))).toContain("14:00");
  });
});

describe("shouldRetryPayment", () => {
  it("retries until the strike limit, then stops", () => {
    expect(shouldRetryPayment(0)).toBe(true);
    expect(shouldRetryPayment(MAX_PAYMENT_RETRIES - 1)).toBe(true);
    expect(shouldRetryPayment(MAX_PAYMENT_RETRIES)).toBe(false);
    expect(shouldRetryPayment(MAX_PAYMENT_RETRIES + 1)).toBe(false);
  });
});
