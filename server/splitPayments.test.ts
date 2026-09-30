import { describe, it, expect } from "vitest";
import {
  sumPaid,
  summarisePayments,
  derivePaymentStatus,
  splitEvenly,
  validatePaymentAmount,
  toCents,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "../shared/splitPayments";

const line = (amount: string | number | null) => ({ amount });

describe("sumPaid", () => {
  it("adds decimal strings without floating point drift", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004, which formats as $0.30 and
    // then fails an equality check against the price.
    expect(sumPaid([line("0.10"), line("0.20")])).toBe(0.3);
    expect(sumPaid([line("19.99"), line("0.01")])).toBe(20);
  });

  it("treats a refund row as negative money taken", () => {
    expect(sumPaid([line("290.00"), line("-50.00")])).toBe(240);
  });

  it("is zero for no payments, and ignores junk rather than returning NaN", () => {
    expect(sumPaid([])).toBe(0);
    expect(sumPaid([line(null), line(""), line("n/a")])).toBe(0);
  });
});

describe("summarisePayments", () => {
  it("reports a part-paid booking as partial with the balance owing", () => {
    const s = summarisePayments("290.00", [line("100.00")]);
    expect(s).toMatchObject({ total: 290, paid: 100, outstanding: 190, status: "partial", overpaid: false });
  });

  it("reports a fully paid booking as paid with nothing outstanding", () => {
    const s = summarisePayments("290.00", [line("100.00"), line("190.00")]);
    expect(s.outstanding).toBe(0);
    expect(s.status).toBe("paid");
  });

  it("reports an untouched booking as unpaid", () => {
    expect(summarisePayments("290.00", []).status).toBe("unpaid");
  });

  it("leaves the status alone when the price was never recorded", () => {
    // Most of the MoeGo-imported history has no price. Guessing a status for
    // those rows would put wrong money into the analytics figures.
    const s = summarisePayments(null, [line("50.00")]);
    expect(s.total).toBeNull();
    expect(s.outstanding).toBeNull();
    expect(s.status).toBeNull();
    expect(s.paid).toBe(50);
  });

  it("counts a free groom as settled rather than unpaid", () => {
    expect(summarisePayments("0.00", []).status).toBe("paid");
  });

  it("flags an overpayment instead of hiding it", () => {
    const s = summarisePayments("100.00", [line("120.00")]);
    expect(s.outstanding).toBe(-20);
    expect(s.overpaid).toBe(true);
    expect(s.status).toBe("paid");
  });

  it("does not call a refunded-to-zero booking paid", () => {
    expect(derivePaymentStatus("290.00", [line("290.00"), line("-290.00")])).toBe("unpaid");
  });
});

describe("splitEvenly", () => {
  it("splits a bill that does not divide, and the parts add back exactly", () => {
    const parts = splitEvenly("100.00", 3);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
    expect(sumPaid(parts.map(line))).toBe(100);
  });

  it("splits a two-dog booking down the middle", () => {
    expect(splitEvenly("290.00", 2)).toEqual([145, 145]);
  });

  it("gives the whole amount back when there is one payer", () => {
    expect(splitEvenly("145.50", 1)).toEqual([145.5]);
  });

  it("distributes the odd cents of a refund the same way", () => {
    const parts = splitEvenly("-100.00", 3);
    expect(parts).toEqual([-33.34, -33.33, -33.33]);
    expect(sumPaid(parts.map(line))).toBe(-100);
  });

  it("returns nothing for a nonsense number of ways", () => {
    expect(splitEvenly("100.00", 0)).toEqual([]);
    expect(splitEvenly("100.00", -2)).toEqual([]);
    expect(splitEvenly("100.00", Number.NaN)).toEqual([]);
  });

  it("splits seven ways without losing a cent", () => {
    const parts = splitEvenly("1000.00", 7);
    expect(sumPaid(parts.map(line))).toBe(1000);
    expect(parts).toHaveLength(7);
  });
});

describe("validatePaymentAmount", () => {
  const owing = (outstanding: number | null, paid = 0) => ({ outstanding, paid });

  it("accepts an amount up to the balance", () => {
    expect(validatePaymentAmount("190", owing(190))).toEqual({ ok: true, amount: 190 });
    expect(validatePaymentAmount("100.50", owing(190))).toEqual({ ok: true, amount: 100.5 });
  });

  it("accepts an amount typed with a dollar sign or thousands separator", () => {
    expect(validatePaymentAmount("$1,290.00", owing(2000))).toEqual({ ok: true, amount: 1290 });
  });

  it("rejects a missed decimal point rather than wrecking the revenue figures", () => {
    // $29000 against a $290 groom is the realistic typo, and it silently
    // moves every analytics total if it lands.
    const result = validatePaymentAmount("29000", owing(290));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("$290.00");
  });

  it("rejects an empty or zero amount", () => {
    expect(validatePaymentAmount("", owing(190)).ok).toBe(false);
    expect(validatePaymentAmount("0", owing(190)).error).toMatch(/zero/i);
    expect(validatePaymentAmount("abc", owing(190)).ok).toBe(false);
  });

  it("refuses to take more money on a booking already settled", () => {
    expect(validatePaymentAmount("10", owing(0, 290)).error).toMatch(/paid in full/i);
  });

  it("allows any amount when the booking has no recorded price", () => {
    expect(validatePaymentAmount("450", owing(null)).ok).toBe(true);
  });

  it("allows a refund of what was taken, but no more", () => {
    expect(validatePaymentAmount("-50", owing(240, 50))).toEqual({ ok: true, amount: -50 });
    const tooMuch = validatePaymentAmount("-100", owing(240, 50));
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.error).toContain("$50.00");
  });
});

describe("payment methods", () => {
  it("labels every method, so the UI cannot show a raw enum value", () => {
    for (const method of PAYMENT_METHODS) {
      expect(PAYMENT_METHOD_LABELS[method]).toBeTruthy();
    }
    expect(Object.keys(PAYMENT_METHOD_LABELS)).toHaveLength(PAYMENT_METHODS.length);
  });
});

describe("toCents", () => {
  it("rounds to the cent rather than truncating", () => {
    expect(toCents("10.005")).toBe(1001);
    expect(toCents(10.004)).toBe(1000);
  });
});
