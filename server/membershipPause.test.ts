import { describe, it, expect } from "vitest";
import {
  addWeeks, addMonths, addBillingCycles, resolvePauseResumesAt,
  validatePausePlan, isDeliberatePause, isDueToResume, membershipsDueToResume,
  describePause, MAX_PAUSE_CYCLES, type PausableMembership,
} from "../shared/membershipPause";

const utc = (iso: string) => new Date(iso);
const NOW = utc("2026-10-27T00:00:00Z");

/** The Brisbane wall-clock reading of an instant, which is what a client sees. */
const bne = (d: Date) =>
  d.toLocaleString("sv-SE", { timeZone: "Australia/Brisbane" }).replace(" ", "T");

describe("addMonths", () => {
  it("keeps the day of the month", () => {
    expect(bne(addMonths(utc("2026-01-15T03:00:00+10:00"), 1))).toBe("2026-02-15T03:00:00");
    expect(bne(addMonths(utc("2026-10-03T00:00:00+10:00"), 2))).toBe("2026-12-03T00:00:00");
  });

  /**
   * 31 January plus a month is 28 February, not 3 March. Rolling over
   * moves a client's billing day permanently later every time it lands
   * on a long month.
   */
  it("clamps to the end of a shorter month instead of rolling over", () => {
    expect(bne(addMonths(utc("2026-01-31T00:00:00+10:00"), 1))).toBe("2026-02-28T00:00:00");
    expect(bne(addMonths(utc("2026-03-31T00:00:00+10:00"), 1))).toBe("2026-04-30T00:00:00");
  });

  it("handles a leap year", () => {
    expect(bne(addMonths(utc("2028-01-31T00:00:00+10:00"), 1))).toBe("2028-02-29T00:00:00");
  });

  it("crosses a year boundary", () => {
    expect(bne(addMonths(utc("2026-11-15T00:00:00+10:00"), 3))).toBe("2027-02-15T00:00:00");
  });

  /**
   * The bug this replaced. 9am Brisbane is 23:00 the PREVIOUS day in
   * UTC, so UTC component maths lands in the wrong month: 1 March gave
   * 29 March and 31 January gave 1 March, defeating the clamp above.
   * `setWeeklyBilling` anchors first charges at 9am, so this was the
   * common case.
   */
  it("is right for a 9am Brisbane anchor, where UTC maths was not", () => {
    expect(bne(addMonths(utc("2026-03-01T09:00:00+10:00"), 1))).toBe("2026-04-01T09:00:00");
    expect(bne(addMonths(utc("2026-01-31T09:00:00+10:00"), 1))).toBe("2026-02-28T09:00:00");
    expect(bne(addMonths(utc("2026-05-01T09:00:00+10:00"), 1))).toBe("2026-06-01T09:00:00");
  });

  it("accepts another salon's offset", () => {
    // Sold to salons outside Queensland; +10 is a default, not a law.
    const utcSalon = addMonths(utc("2026-03-01T09:00:00Z"), 1, 0);
    expect(utcSalon.toISOString()).toBe("2026-04-01T09:00:00.000Z");
  });
});

describe("addWeeks", () => {
  it("adds whole weeks", () => {
    expect(addWeeks(utc("2026-10-27T00:00:00Z"), 2).toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });
});

describe("addBillingCycles", () => {
  it("counts a weekly cycle as a week", () => {
    expect(addBillingCycles(utc("2026-10-27T00:00:00Z"), 3, "weekly").toISOString())
      .toBe("2026-11-17T00:00:00.000Z");
  });

  it("counts a monthly cycle as a calendar month", () => {
    expect(addBillingCycles(utc("2026-10-27T00:00:00Z"), 2, "monthly").toISOString())
      .toBe("2026-12-27T00:00:00.000Z");
  });

  /**
   * A membership can bill every N weeks. "Skip a cycle" has to mean
   * skip that whole period, or a fortnightly client pausing for one
   * cycle still gets charged a week later.
   */
  it("respects a multi-week cycle", () => {
    expect(addBillingCycles(utc("2026-10-27T00:00:00Z"), 1, "weekly", 2).toISOString())
      .toBe("2026-11-10T00:00:00.000Z");
  });
});

describe("resolvePauseResumesAt", () => {
  const context = { billingCycle: "weekly" as const, now: NOW, nextBillingDate: utc("2026-11-03T00:00:00Z") };

  /**
   * Cycles count from the next billing date, not from today: "skip two
   * payments" set the day before a charge should skip that charge.
   */
  it("counts cycles from the next billing date", () => {
    expect(resolvePauseResumesAt({ mode: "cycles", cycles: 2 }, context)!.toISOString())
      .toBe("2026-11-17T00:00:00.000Z");
  });

  /**
   * `nextBillingDate` is set once and nothing advances it on a
   * hand-billed membership, so on most of the book it is in the past.
   * Counting forward from it produced a restart date BEHIND today, and
   * the next sweep would have ended the pause on the spot.
   */
  it("never resolves a restart date in the past from a stale billing date", () => {
    const stale = { ...context, nextBillingDate: utc("2026-09-01T09:00:00+10:00") };
    const resumed = resolvePauseResumesAt({ mode: "cycles", cycles: 2 }, stale)!;
    expect(resumed.getTime()).toBeGreaterThan(NOW.getTime());
    expect(bne(resumed)).toBe("2026-11-10T10:00:00");
  });

  it("falls back to today when no next billing date is on file", () => {
    const resumed = resolvePauseResumesAt({ mode: "cycles", cycles: 1 }, { ...context, nextBillingDate: null })!;
    expect(resumed.toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });

  it("takes a chosen date as given", () => {
    const chosen = utc("2027-01-04T00:00:00Z");
    expect(resolvePauseResumesAt({ mode: "date", resumeOn: chosen }, context)).toEqual(chosen);
  });

  it("has no restart date for a manual pause", () => {
    expect(resolvePauseResumesAt({ mode: "manual" }, context)).toBeNull();
  });
});

describe("validatePausePlan", () => {
  it("accepts a sensible plan", () => {
    expect(validatePausePlan({ mode: "cycles", cycles: 1 }, NOW).ok).toBe(true);
    expect(validatePausePlan({ mode: "manual" }, NOW).ok).toBe(true);
    expect(validatePausePlan({ mode: "date", resumeOn: utc("2026-12-01T00:00:00Z") }, NOW).ok).toBe(true);
  });

  it("refuses a cycle count that is not a whole number of cycles", () => {
    for (const cycles of [0, -1, 1.5, Number.NaN]) {
      expect(validatePausePlan({ mode: "cycles", cycles }, NOW).ok, String(cycles)).toBe(false);
    }
    expect(validatePausePlan({ mode: "cycles", cycles: MAX_PAUSE_CYCLES + 1 }, NOW).ok).toBe(false);
  });

  it("refuses a restart date in the past", () => {
    const result = validatePausePlan({ mode: "date", resumeOn: utc("2026-10-01T00:00:00Z") }, NOW);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/future/i);
  });

  /** A typo in a date field must not park a paying client until 2126. */
  it("refuses a restart date absurdly far ahead", () => {
    expect(validatePausePlan({ mode: "date", resumeOn: utc("2126-01-01T00:00:00Z") }, NOW).ok).toBe(false);
  });

  it("refuses an unparseable date", () => {
    expect(validatePausePlan({ mode: "date", resumeOn: new Date("nonsense") }, NOW).ok).toBe(false);
  });
});

const deliberate: PausableMembership = {
  status: "paused", pauseMode: "date",
  pauseResumesAt: utc("2026-11-01T00:00:00Z"),
  failedPaymentCount: 0, bookingSuspended: false,
};

/** What the failed-payment escalation leaves behind at strike two. */
const suspended: PausableMembership = {
  status: "paused", pauseMode: null, pauseResumesAt: null,
  failedPaymentCount: 2, bookingSuspended: true,
};

describe("isDeliberatePause", () => {
  it("recognises a pause somebody chose", () => {
    expect(isDeliberatePause(deliberate)).toBe(true);
  });

  /**
   * THE important one. Both states read status "paused"; only one of
   * them should ever be resumed by a scheduled job.
   */
  it("does not mistake a failed-payment suspension for a pause", () => {
    expect(isDeliberatePause(suspended)).toBe(false);
  });

  it("stands down once a payment has failed on a paused membership", () => {
    expect(isDeliberatePause({ ...deliberate, failedPaymentCount: 1 })).toBe(false);
    expect(isDeliberatePause({ ...deliberate, bookingSuspended: true })).toBe(false);
  });

  it("is false for any other status", () => {
    for (const status of ["active", "cancelled", "pending_payment", "expired"]) {
      expect(isDeliberatePause({ ...deliberate, status })).toBe(false);
    }
  });
});

describe("isDueToResume", () => {
  it("is due once the restart date has passed", () => {
    expect(isDueToResume(deliberate, utc("2026-11-01T00:00:01Z"))).toBe(true);
    expect(isDueToResume(deliberate, utc("2026-10-31T23:59:59Z"))).toBe(false);
  });

  /**
   * A client told "it stays off until you tell us" must not be charged
   * because some timeout elapsed.
   */
  it("never becomes due for a manual pause", () => {
    const manual = { ...deliberate, pauseMode: "manual" as const, pauseResumesAt: null };
    expect(isDueToResume(manual, utc("2030-01-01T00:00:00Z"))).toBe(false);
  });

  it("never resumes a failed-payment suspension, whatever the date", () => {
    const trap = { ...suspended, pauseResumesAt: utc("2020-01-01T00:00:00Z") };
    expect(isDueToResume(trap, utc("2030-01-01T00:00:00Z"))).toBe(false);
  });

  /**
   * The case the mark alone would not catch: a row carrying a STALE
   * `pauseMode` from an earlier holiday that has since failed a
   * payment. Only two places clear that column, so such a row is
   * reachable. The failure counters are what must refuse it, and this
   * asserts that through isDueToResume rather than only through
   * isDeliberatePause.
   */
  it("refuses a row with a stale pause mark that is now failing", () => {
    const stale = {
      status: "paused", pauseMode: "date" as const,
      pauseResumesAt: utc("2020-01-01T00:00:00Z"),
      failedPaymentCount: 2, bookingSuspended: true,
    };
    expect(isDueToResume(stale, utc("2030-01-01T00:00:00Z"))).toBe(false);
    // Each counter alone is enough to stop it.
    expect(isDueToResume({ ...stale, bookingSuspended: false }, utc("2030-01-01T00:00:00Z"))).toBe(false);
    expect(isDueToResume({ ...stale, failedPaymentCount: 0 }, utc("2030-01-01T00:00:00Z"))).toBe(false);
  });

  it("picks exactly the due ones out of a mixed list", () => {
    const now = utc("2026-11-02T00:00:00Z");
    const rows = [deliberate, suspended,
      { ...deliberate, pauseResumesAt: utc("2027-01-01T00:00:00Z") },
      { ...deliberate, pauseMode: "manual" as const, pauseResumesAt: null }];
    expect(membershipsDueToResume(rows, now)).toEqual([deliberate]);
  });
});

describe("describePause", () => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  it("says when billing restarts", () => {
    expect(describePause(deliberate, fmt)).toBe("Paused — billing restarts 2026-11-01");
  });

  it("says a manual pause waits for a person", () => {
    expect(describePause({ ...deliberate, pauseMode: "manual", pauseResumesAt: null }, fmt))
      .toMatch(/until someone restarts/i);
  });

  /** Staff must not read a debt as a holiday. */
  it("calls a failed-payment suspension what it is", () => {
    expect(describePause(suspended, fmt)).toMatch(/failed payment/i);
  });

  it("says nothing for a membership that is not paused", () => {
    expect(describePause({ ...deliberate, status: "active" }, fmt)).toBe("Not paused");
  });
});
