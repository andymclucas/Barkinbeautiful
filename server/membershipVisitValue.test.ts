import { describe, it, expect } from "vitest";
import { visitValueCents, membershipVisitValueCents } from "../shared/membershipVisitValue";
import { intervalWeeksForTier } from "../shared/membershipPackages";

describe("intervalWeeksForTier", () => {
  it("matches the salon's published cadences", () => {
    expect(intervalWeeksForTier("diamond")).toBe(2);
    expect(intervalWeeksForTier("platinum")).toBe(3);
    expect(intervalWeeksForTier("gold")).toBe(4);
    expect(intervalWeeksForTier("silver")).toBe(6);
    expect(intervalWeeksForTier("bronze")).toBe(8);
  });

  it("understates rather than throwing on an unknown tier", () => {
    // A figure that is too low is a worse day on a report; an exception
    // is a blank Appointments page.
    expect(intervalWeeksForTier("platinum-plus")).toBe(8);
    expect(intervalWeeksForTier(null)).toBe(8);
  });

  it("does not care about case", () => {
    expect(intervalWeeksForTier("SILVER")).toBe(6);
  });
});

describe("visitValueCents", () => {
  /** The live averages, so the figures are ones Andy would recognise. */
  it("values a visit at the weekly rate times the tier's weeks", () => {
    expect(visitValueCents({ membershipId: 1, pricePerCycle: "23.78", tier: "silver" })).toBe(14268);
    expect(visitValueCents({ membershipId: 2, pricePerCycle: "21.17", tier: "bronze" })).toBe(16936);
    expect(visitValueCents({ membershipId: 3, pricePerCycle: "64.40", tier: "diamond" })).toBe(12880);
  });

  it("is zero when there is no usable rate", () => {
    for (const price of [null, undefined, "", "0.00", "nonsense", -5]) {
      expect(visitValueCents({ membershipId: 1, pricePerCycle: price, tier: "silver" }), String(price)).toBe(0);
    }
  });

  it("reads a number as readily as a decimal string", () => {
    expect(visitValueCents({ membershipId: 1, pricePerCycle: 23.78, tier: "silver" })).toBe(14268);
  });
});

describe("membershipVisitValueCents", () => {
  /**
   * The trap this is built to avoid. 27 of 151 active plans cover a
   * whole household on one fee, and the dog count lives only in the
   * plan's NAME — which the codebase says is for blocking, never for
   * pricing. Counting each PLAN once makes the question moot.
   */
  it("counts a household's single fee once, however many dogs came", () => {
    const plan = { membershipId: 3, pricePerCycle: "104.00", tier: "diamond" };
    expect(membershipVisitValueCents([plan, plan, plan])).toBe(visitValueCents(plan));
  });

  it("adds up different plans", () => {
    expect(membershipVisitValueCents([
      { membershipId: 1, pricePerCycle: "23.78", tier: "silver" },
      { membershipId: 2, pricePerCycle: "21.17", tier: "bronze" },
    ])).toBe(14268 + 16936);
  });

  it("is zero for a day with no memberships on the board", () => {
    expect(membershipVisitValueCents([])).toBe(0);
  });

  it("ignores a row with no plan id rather than counting it as one", () => {
    expect(membershipVisitValueCents([
      { membershipId: null as unknown as number, pricePerCycle: "23.78", tier: "silver" },
    ])).toBe(0);
  });
});
