import { describe, it, expect } from "vitest";
import { cashTender, describeChange, acceptsOverTender } from "../shared/cashTendered";

describe("cashTender", () => {
  it("handles Lauren's case: $200 cash against a $110 groom", () => {
    // 27/10/2026. The panel refused this outright and the payment could
    // not be recorded while the client stood at the counter.
    expect(cashTender({ tendered: "200.00", outstanding: 110 }))
      .toEqual({ ok: true, applied: 110, change: 90, settles: true });
  });

  it("records what the salon KEPT, never what was handed over", () => {
    // $200 in and $90 out is $110 of revenue. Recording the $200 would
    // put money the salon does not have into every revenue report and
    // mark the booking overpaid.
    const t = cashTender({ tendered: 200, outstanding: 110 });
    if (!t.ok) throw new Error("should be ok");
    expect(t.applied).toBe(110);
    expect(t.applied + t.change).toBe(200);
  });

  it("treats under-tendering as a part payment, not an error", () => {
    expect(cashTender({ tendered: 50, outstanding: 110 }))
      .toEqual({ ok: true, applied: 50, change: 0, settles: false });
  });

  it("gives no change on an exact amount", () => {
    expect(cashTender({ tendered: 110, outstanding: 110 }))
      .toEqual({ ok: true, applied: 110, change: 0, settles: true });
  });

  it("handles awkward amounts to the cent", () => {
    expect(cashTender({ tendered: 100, outstanding: 36.67 }))
      .toEqual({ ok: true, applied: 36.67, change: 63.33, settles: true });
    expect(cashTender({ tendered: "50", outstanding: 36.67 }))
      .toEqual({ ok: true, applied: 36.67, change: 13.33, settles: true });
  });

  it("refuses a booking that is already settled", () => {
    expect(cashTender({ tendered: 50, outstanding: 0 }))
      .toEqual({ ok: false, error: "This booking is already paid in full" });
  });

  it("refuses nonsense rather than guessing", () => {
    for (const bad of ["", null, undefined, "abc"]) {
      expect(cashTender({ tendered: bad, outstanding: 110 }).ok).toBe(false);
    }
    expect(cashTender({ tendered: 0, outstanding: 110 }).ok).toBe(false);
    // Negative cash is not a thing; refunds have their own path.
    expect(cashTender({ tendered: -20, outstanding: 110 }))
      .toEqual({ ok: false, error: "Cash tendered cannot be negative" });
  });

  it("applies everything when nothing has been priced", () => {
    // No figure to bill against means nothing can be "too much".
    expect(cashTender({ tendered: 60, outstanding: null }))
      .toEqual({ ok: true, applied: 60, change: 0, settles: false });
  });

  it("copes with a $ sign and commas, as typed", () => {
    expect(cashTender({ tendered: "$1,200.00", outstanding: 110 }))
      .toMatchObject({ ok: true, applied: 110, change: 1090 });
  });
});

describe("acceptsOverTender", () => {
  it("is cash and nothing else", () => {
    // You cannot charge a card more than is owed, so over-tendering must
    // stay refused for every electronic method.
    expect(acceptsOverTender("cash")).toBe(true);
    for (const m of ["eftpos", "card", "stripe", "bank_transfer", "store_credit", "other"]) {
      expect(acceptsOverTender(m)).toBe(false);
    }
  });
});

describe("describeChange", () => {
  it("reads out only when there is change", () => {
    expect(describeChange(90)).toBe("Change $90.00");
    expect(describeChange(63.33)).toBe("Change $63.33");
    expect(describeChange(0)).toBe("");
  });
});
