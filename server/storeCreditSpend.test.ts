import { describe, it, expect } from "vitest";
import {
  spendsStoreCredit, creditEntryForPayment, reversalEntryForPayment,
  describeCreditShortfall,
} from "@shared/storeCreditSpend";

describe("spendsStoreCredit", () => {
  it("is true only for store credit", () => {
    expect(spendsStoreCredit("store_credit")).toBe(true);
    for (const m of ["cash", "eftpos", "card", "stripe", "bank_transfer", "other"]) {
      expect(spendsStoreCredit(m), m).toBe(false);
    }
  });
});

describe("creditEntryForPayment", () => {
  it("debits the balance when credit is spent", () => {
    expect(creditEntryForPayment({ method: "store_credit", amount: 90, appointmentId: 2040003 }))
      .toEqual({
        amount: "-90.00",
        type: "appointment_deduction",
        note: "Store credit used against appointment 2040003",
      });
  });

  /**
   * The sign is the thing most likely to be got backwards, and getting
   * it backwards doubles a client's credit instead of spending it.
   */
  it("puts credit BACK when the payment is a refund", () => {
    const e = creditEntryForPayment({ method: "store_credit", amount: -40, appointmentId: 2520008 });
    expect(e?.amount).toBe("40.00");
    expect(e?.type).toBe("refund");
  });

  it("is null for real money, which has nothing to do with the balance", () => {
    expect(creditEntryForPayment({ method: "cash", amount: 90, appointmentId: 1 })).toBeNull();
    expect(creditEntryForPayment({ method: "eftpos", amount: 90, appointmentId: 1 })).toBeNull();
  });

  it("is null for nothing at all, rather than writing a zero row", () => {
    expect(creditEntryForPayment({ method: "store_credit", amount: 0, appointmentId: 1 })).toBeNull();
    expect(creditEntryForPayment({ method: "store_credit", amount: NaN, appointmentId: 1 })).toBeNull();
  });

  it("writes cents, because the column is a decimal", () => {
    expect(creditEntryForPayment({ method: "store_credit", amount: 12.5, appointmentId: 1 })?.amount)
      .toBe("-12.50");
  });
});

describe("reversalEntryForPayment", () => {
  /** Removing a payment must leave the balance exactly where it started. */
  it("exactly undoes the original", () => {
    for (const amount of [90, -40, 12.5, 0.01, 840]) {
      const spent = creditEntryForPayment({ method: "store_credit", amount, appointmentId: 7 })!;
      const back = reversalEntryForPayment({ method: "store_credit", amount, appointmentId: 7 })!;
      expect(Number(spent.amount) + Number(back.amount), `${amount}`).toBe(0);
    }
  });

  it("says what it reversed", () => {
    expect(reversalEntryForPayment({ method: "store_credit", amount: 90, appointmentId: 7 })?.note)
      .toContain("Reversed:");
  });

  it("is null for real money", () => {
    expect(reversalEntryForPayment({ method: "cash", amount: 90, appointmentId: 7 })).toBeNull();
  });
});

describe("describeCreditShortfall", () => {
  it("is quiet when the balance covers it", () => {
    const r = describeCreditShortfall(840, 40);
    expect(r.remaining).toBe(800);
    expect(r.short).toBe(false);
    expect(r.message).toBeNull();
  });

  it("is quiet when it exactly empties the balance", () => {
    const r = describeCreditShortfall(90, 90);
    expect(r.remaining).toBe(0);
    expect(r.short).toBe(false);
  });

  /**
   * Irene Fang on 30/10/2026: $180 taken against a balance of nothing,
   * because her credit is still in MoeGo. Reported, not blocked —
   * refusing would have stopped the counter mid-migration.
   */
  it("says plainly when more is spent than exists", () => {
    const r = describeCreditShortfall(0, 180);
    expect(r.remaining).toBe(-180);
    expect(r.short).toBe(true);
    expect(r.message).toContain("$0.00 of store credit");
    expect(r.message).toContain("$-180.00");
    expect(r.message).toContain("carried across");
  });

  it("does not trip on a fraction of a cent", () => {
    expect(describeCreditShortfall(0.1 + 0.2, 0.3).short).toBe(false);
  });

  it("treats missing figures as zero rather than NaN", () => {
    expect(describeCreditShortfall(NaN, 50).remaining).toBe(-50);
    expect(describeCreditShortfall(50, NaN).remaining).toBe(50);
  });
});
