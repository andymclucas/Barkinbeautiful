import { describe, it, expect } from "vitest";
import { allocateAcrossDogs, totalOutstanding, describeAllocation } from "../shared/payAcrossDogs";

/** Lauren's booking: Agnes and Shirley, $145 each. */
const AGNES = { appointmentId: 1, petName: "Agnes", outstanding: 145 };
const SHIRLEY = { appointmentId: 2, petName: "Shirley", outstanding: 145 };
const BOOKING = [AGNES, SHIRLEY];

describe("allocateAcrossDogs", () => {
  it("takes the whole $290 in one go — the case that was rejected", () => {
    const out = allocateAcrossDogs("290", BOOKING);
    expect(out.ok).toBe(true);
    expect(out.ok && out.allocations).toEqual([
      { appointmentId: 1, petName: "Agnes", amount: 145 },
      { appointmentId: 2, petName: "Shirley", amount: 145 },
    ]);
  });

  it("fills each dog in turn rather than splitting a part payment evenly", () => {
    // $100 leaves Agnes PAID and Shirley owing $45. Both owing $50 would
    // be two dogs to chase instead of one.
    const out = allocateAcrossDogs("100", BOOKING);
    expect(out.ok && out.allocations).toEqual([
      { appointmentId: 1, petName: "Agnes", amount: 100 },
    ]);
  });

  it("spills into the next dog once the first is covered", () => {
    const out = allocateAcrossDogs("200", BOOKING);
    expect(out.ok && out.allocations).toEqual([
      { appointmentId: 1, petName: "Agnes", amount: 145 },
      { appointmentId: 2, petName: "Shirley", amount: 55 },
    ]);
  });

  it("refuses more than the booking owes", () => {
    // An overpayment here is money the salon has to find and give back.
    const out = allocateAcrossDogs("300", BOOKING);
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toContain("$290.00");
  });

  it("skips a dog that is already paid", () => {
    const out = allocateAcrossDogs("145", [{ ...AGNES, outstanding: 0 }, SHIRLEY]);
    expect(out.ok && out.allocations).toEqual([
      { appointmentId: 2, petName: "Shirley", amount: 145 },
    ]);
  });

  it("refuses when nothing is owed", () => {
    const out = allocateAcrossDogs("50", [{ ...AGNES, outstanding: 0 }]);
    expect(!out.ok && out.error).toBe("This booking is already paid in full");
  });

  it("ignores a dog with no price set rather than guessing one", () => {
    const out = allocateAcrossDogs("145", [{ ...AGNES, outstanding: null }, SHIRLEY]);
    expect(out.ok && out.allocations).toEqual([
      { appointmentId: 2, petName: "Shirley", amount: 145 },
    ]);
  });

  it("sends a refund down the per-dog path", () => {
    // Spreading a refund would credit whichever dog happens to be first.
    const out = allocateAcrossDogs("-50", BOOKING);
    expect(!out.ok && out.error).toContain("one dog at a time");
  });

  it("handles odd cents without losing or inventing one", () => {
    const odd = [
      { appointmentId: 1, petName: "A", outstanding: 33.33 },
      { appointmentId: 2, petName: "B", outstanding: 33.34 },
    ];
    const out = allocateAcrossDogs("66.67", odd);
    expect(out.ok).toBe(true);
    const sum = out.ok ? out.allocations.reduce((s, a) => s + a.amount, 0) : 0;
    expect(Math.round(sum * 100)).toBe(6667);
  });

  it("copes with a typed dollar sign and spaces", () => {
    expect(allocateAcrossDogs("$ 290.00 ", BOOKING).ok).toBe(true);
  });

  it("rejects nothing and nonsense", () => {
    expect(allocateAcrossDogs("", BOOKING).ok).toBe(false);
    expect(allocateAcrossDogs("abc", BOOKING).ok).toBe(false);
    expect(allocateAcrossDogs("0", BOOKING).ok).toBe(false);
  });
});

describe("totalOutstanding", () => {
  it("adds up what the booking owes", () => {
    expect(totalOutstanding(BOOKING)).toBe(290);
  });

  it("ignores unpriced dogs rather than treating them as zero-owing errors", () => {
    expect(totalOutstanding([{ ...AGNES, outstanding: null }, SHIRLEY])).toBe(145);
  });
});

describe("describeAllocation", () => {
  it("reads back who is being paid for", () => {
    const out = allocateAcrossDogs("290", BOOKING);
    expect(describeAllocation(out.ok ? out.allocations : []))
      .toBe("Agnes $145.00 and Shirley $145.00");
  });

  it("is empty when nothing is allocated", () => {
    expect(describeAllocation([])).toBe("");
  });
});
