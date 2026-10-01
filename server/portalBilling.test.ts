import { describe, it, expect } from "vitest";
import {
  buildPaymentTimeline, invoiceOutstanding, isPaidInvoice, toAmount, formatMoney, totalPaid,
} from "@shared/portalBilling";

describe("toAmount / formatMoney", () => {
  it("copes with the decimal strings MySQL returns", () => {
    expect(toAmount("104.00")).toBe(104);
    expect(toAmount(51.5)).toBe(51.5);
    expect(formatMoney("104.00")).toBe("$104.00");
    expect(formatMoney("1")).toBe("$1.00");
  });

  it("treats missing or junk values as zero rather than NaN", () => {
    expect(toAmount(null)).toBe(0);
    expect(toAmount(undefined)).toBe(0);
    expect(toAmount("not money")).toBe(0);
    expect(formatMoney(null)).toBe("$0.00");
  });
});

describe("invoice status", () => {
  it("only counts an unpaid invoice as outstanding", () => {
    const invoices = [
      { id: 1, total: "100.00", status: "paid" },
      { id: 2, total: "40.00", status: "pending" },
      { id: 3, total: "10.00", status: "overdue" },
    ];
    expect(isPaidInvoice(invoices[0])).toBe(true);
    expect(invoiceOutstanding(invoices)).toBe(50);
  });

  it("is not case sensitive", () => {
    expect(isPaidInvoice({ id: 1, status: "Paid" })).toBe(true);
  });
});

describe("buildPaymentTimeline", () => {
  it("merges all three sources, newest first", () => {
    const rows = buildPaymentTimeline({
      invoices: [{ id: 1, total: "80.00", status: "paid", paidAt: "2026-09-01", invoiceNumber: "INV-1" }],
      membershipPayments: [{ id: 5, amount: "104.00", status: "paid", paidAt: "2026-09-20" }],
      appointmentPayments: [{ id: 9, amount: "35.00", createdAt: "2026-09-10", method: "cash" }],
    });
    expect(rows.map(r => r.key)).toEqual(["membership-5", "appointment-9", "invoice-1"]);
    expect(totalPaid(rows)).toBe(219);
  });

  it("leaves out an unpaid invoice and a failed membership charge", () => {
    // A failed charge is not money the client parted with; showing it on
    // their own statement would be alarming and wrong.
    const rows = buildPaymentTimeline({
      invoices: [{ id: 1, total: "80.00", status: "pending", paidAt: null }],
      membershipPayments: [{ id: 5, amount: "104.00", status: "failed", paidAt: "2026-09-20" }],
    });
    expect(rows).toEqual([]);
  });

  it("keys are unique across sources that share an id", () => {
    const rows = buildPaymentTimeline({
      invoices: [{ id: 7, total: "10.00", status: "paid", paidAt: "2026-09-01" }],
      membershipPayments: [{ id: 7, amount: "20.00", status: "paid", paidAt: "2026-09-02" }],
      appointmentPayments: [{ id: 7, amount: "30.00", createdAt: "2026-09-03" }],
    });
    expect(new Set(rows.map(r => r.key)).size).toBe(3);
  });

  it("does not drop a row with no date", () => {
    const rows = buildPaymentTimeline({
      membershipPayments: [{ id: 1, amount: "5.00", status: "paid", paidAt: null }],
    });
    expect(rows).toHaveLength(1);
  });

  it("returns nothing for a client with no billing history", () => {
    expect(buildPaymentTimeline({})).toEqual([]);
  });
});
