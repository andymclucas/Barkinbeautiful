import { describe, it, expect } from "vitest";
import {
  WEEKLY_TO_MONTHLY, weeklyToMonthly, monthlyToWeekly,
  annualisedCost, describeRate, switchImpact, resolveChargePlan,
} from "../shared/membershipBillingCycle";

describe("the multiplier", () => {
  it("is 52/12, not 4", () => {
    // The entire point of the module. If this ever reads 4, four weeks of
    // revenue a year are being given away.
    expect(WEEKLY_TO_MONTHLY).toBeCloseTo(4.3333, 4);
    expect(WEEKLY_TO_MONTHLY).not.toBe(4);
  });

  it("costs the live book $16,400 a year to get wrong", () => {
    // Measured against 153 active memberships at $4,100/week, 23/10/2026.
    const weeklyTake = 4100;
    const correct = weeklyTake * WEEKLY_TO_MONTHLY * 12;
    const naive = weeklyTake * 4 * 12;
    expect(Math.round(correct)).toBe(213200);
    expect(Math.round(naive)).toBe(196800);
    expect(Math.round(correct - naive)).toBe(16400);
  });
});

describe("weeklyToMonthly", () => {
  it("converts a rate so the year costs the same", () => {
    expect(weeklyToMonthly("15.00")).toBe("65.00");
    expect(weeklyToMonthly("104.00")).toBe("450.67");
    expect(weeklyToMonthly("30.00")).toBe("130.00");
  });

  it("rounds to the dollar when asked, and always upward when asked that", () => {
    expect(weeklyToMonthly("104.00", "dollar")).toBe("451.00");
    expect(weeklyToMonthly("104.00", "dollar_up")).toBe("451.00");
    // 450.666 rounds DOWN to 450 on nearest, but up to 451 on dollar_up.
    expect(weeklyToMonthly("103.90", "dollar")).toBe("450.00");
    expect(weeklyToMonthly("103.90", "dollar_up")).toBe("451.00");
  });

  it("refuses an unusable price rather than making it free", () => {
    // "0.00" must not become a $0 monthly membership nobody notices.
    for (const bad of [null, undefined, "", "   ", "abc", "0", "0.00", "-5"]) {
      expect(weeklyToMonthly(bad)).toBeNull();
    }
  });

  it("takes a number as readily as a string", () => {
    expect(weeklyToMonthly(15)).toBe("65.00");
  });
});

describe("monthlyToWeekly", () => {
  it("is the inverse, to the cent", () => {
    expect(monthlyToWeekly("65.00")).toBe("15.00");
    expect(monthlyToWeekly("130.00")).toBe("30.00");
  });

  it("round-trips every live price without drifting", () => {
    // The real spread on the book: $15 to $104 a week.
    for (let cents = 1500; cents <= 10400; cents += 5) {
      const weekly = (cents / 100).toFixed(2);
      const back = monthlyToWeekly(weeklyToMonthly(weekly)!);
      // Within a cent: the monthly figure is itself rounded, so an exact
      // round trip is not available, but drift must not accumulate.
      expect(Math.abs(Number(back) - Number(weekly))).toBeLessThanOrEqual(0.01);
    }
  });
});

describe("annualisedCost", () => {
  it("is the only fair way to compare the two cycles", () => {
    expect(annualisedCost("15.00", "weekly")).toBe("780.00");
    expect(annualisedCost("65.00", "monthly")).toBe("780.00");
  });

  it("shows the x4 shortfall for what it is", () => {
    expect(annualisedCost("60.00", "monthly")).toBe("720.00"); // 15 x 4
    expect(annualisedCost("15.00", "weekly")).toBe("780.00");
  });
});

describe("switchImpact", () => {
  it("reports a correct conversion as revenue-neutral", () => {
    const impact = switchImpact("15.00")!;
    expect(impact.monthly).toBe("65.00");
    expect(impact.annualBefore).toBe("780.00");
    expect(impact.annualAfter).toBe("780.00");
    expect(impact.differenceCents).toBe(0);
  });

  it("keeps the whole-book drift under a dollar a year", () => {
    const weeklies = ["15.00", "20.00", "26.80", "30.00", "45.50", "104.00"];
    const drift = weeklies.reduce((sum, w) => sum + switchImpact(w)!.differenceCents, 0);
    expect(Math.abs(drift)).toBeLessThan(100);
  });

  it("returns null for an unpriced membership", () => {
    expect(switchImpact(null)).toBeNull();
  });
});

describe("describeRate", () => {
  it("always says which cycle, because the number alone is ambiguous", () => {
    expect(describeRate("15.00", "weekly")).toBe("$15.00/week");
    expect(describeRate("65.00", "monthly")).toBe("$65.00/month");
    expect(describeRate(null, "weekly")).toBe("unpriced");
  });
});

describe("resolveChargePlan — the cadence and the amount together", () => {
  it("bills a monthly membership monthly, at the MONTHLY amount", () => {
    // The defect this exists for: before, cadence came from
    // billing_cycle_weeks (=1 -> weekly) and the amount from
    // price_per_cycle (the weekly rate), so a monthly membership was
    // billed $104 every WEEK instead of $450.67 every month.
    const plan = resolveChargePlan({
      billingCycle: "monthly", billingCycleWeeks: 1, pricePerCycle: "104.00",
    });
    expect(plan).toEqual({
      ok: true, cycle: "monthly", amountCents: 45067, label: "$450.67/month",
    });
  });

  it("leaves a weekly membership exactly as it billed before", () => {
    const plan = resolveChargePlan({
      billingCycle: "weekly", billingCycleWeeks: 1, pricePerCycle: "104.00",
    });
    expect(plan).toEqual({
      ok: true, cycle: "weekly", amountCents: 10400, label: "$104.00/week",
    });
  });

  it("still honours a fortnightly membership from the weeks column", () => {
    // price_per_cycle is the per-FORTNIGHT amount there, not a weekly
    // rate, so it passes through untouched.
    const plan = resolveChargePlan({
      billingCycle: "weekly", billingCycleWeeks: 2, pricePerCycle: "208.00",
    });
    expect(plan).toEqual({
      ok: true, cycle: "fortnightly", amountCents: 20800, label: "$208.00/fortnight",
    });
  });

  it("refuses a cadence Stripe billing cannot express", () => {
    const plan = resolveChargePlan({ billingCycle: "weekly", billingCycleWeeks: 4, pricePerCycle: "400.00" });
    expect(plan.ok).toBe(false);
    // 4-weekly bills 13 times a year and monthly 12 — picking one would
    // over- or undercharge, so it asks a human.
    if (!plan.ok) expect(plan.error).toMatch(/every 4 weeks/);
  });

  it("refuses an unpriced membership rather than billing zero", () => {
    for (const bad of [null, undefined, "", "0.00", "-1"]) {
      const plan = resolveChargePlan({ billingCycle: "monthly", billingCycleWeeks: 1, pricePerCycle: bad });
      expect(plan.ok).toBe(false);
    }
  });

  it("treats a missing billing_cycle as weekly, not as monthly", () => {
    // Old rows and any insert that never names the column must keep
    // billing exactly as they do today.
    const plan = resolveChargePlan({ billingCycleWeeks: 1, pricePerCycle: "15.00" });
    expect(plan).toMatchObject({ ok: true, cycle: "weekly", amountCents: 1500 });
  });

  it("charges the same over a year whichever cycle is chosen", () => {
    const weekly = resolveChargePlan({ billingCycle: "weekly", billingCycleWeeks: 1, pricePerCycle: "15.00" });
    const monthly = resolveChargePlan({ billingCycle: "monthly", billingCycleWeeks: 1, pricePerCycle: "15.00" });
    if (!weekly.ok || !monthly.ok) throw new Error("both should resolve");
    expect(weekly.amountCents * 52).toBe(monthly.amountCents * 12);
  });
});
