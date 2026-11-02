import { describe, it, expect } from "vitest";
import { allocateInvoicePayment } from "@shared/invoicePaymentAllocation";

const bill = (appointmentId: number, total: string | null, paid: string[] = []) => ({
  appointmentId,
  total,
  paidLines: paid.map((amount) => ({ amount })),
});

describe("allocateInvoicePayment", () => {
  it("settles a single dog exactly", () => {
    const out = allocateInvoicePayment([bill(1, "110.00")], 110);
    expect(out.posted).toEqual([{ appointmentId: 1, amount: 110 }]);
    expect(out.unallocated).toBe(0);
  });

  it("spreads a household payment across the dogs in order", () => {
    const out = allocateInvoicePayment([bill(1, "110.00"), bill(2, "88.00")], 198);
    expect(out.posted).toEqual([
      { appointmentId: 1, amount: 110 },
      { appointmentId: 2, amount: 88 },
    ]);
    expect(out.unallocated).toBe(0);
  });

  /**
   * The one that matters. Allocating against the TOTAL rather than what
   * is still owed would put $110 on a dog that owes $60 and show it
   * overpaid, and the next person refunds money nobody is owed.
   */
  it("allocates against what is still owed, not the full price", () => {
    const out = allocateInvoicePayment([bill(1, "110.00", ["50.00"]), bill(2, "88.00")], 148);
    expect(out.posted).toEqual([
      { appointmentId: 1, amount: 60 },
      { appointmentId: 2, amount: 88 },
    ]);
    expect(out.unallocated).toBe(0);
  });

  it("gives an unpriced or cancelled dog nothing and reports the remainder", () => {
    const out = allocateInvoicePayment([bill(1, null), bill(2, "88.00")], 148);
    expect(out.posted).toEqual([{ appointmentId: 2, amount: 88 }]);
    expect(out.unallocated).toBe(60);
  });

  it("never posts more than is owed, and says what was left over", () => {
    const out = allocateInvoicePayment([bill(1, "110.00")], 200);
    expect(out.posted).toEqual([{ appointmentId: 1, amount: 110 }]);
    expect(out.unallocated).toBe(90);
  });

  it("posts nothing when everything is already settled", () => {
    const out = allocateInvoicePayment([bill(1, "110.00", ["110.00"])], 110);
    expect(out.posted).toEqual([]);
    expect(out.unallocated).toBe(110);
  });

  it("runs out part way and leaves the rest owing", () => {
    const out = allocateInvoicePayment([bill(1, "110.00"), bill(2, "88.00")], 150);
    expect(out.posted).toEqual([
      { appointmentId: 1, amount: 110 },
      { appointmentId: 2, amount: 40 },
    ]);
    expect(out.unallocated).toBe(0);
  });

  it("handles no appointments and junk amounts without inventing a payment", () => {
    expect(allocateInvoicePayment([], 110)).toEqual({ posted: [], unallocated: 110 });
    expect(allocateInvoicePayment([bill(1, "110.00")], 0).posted).toEqual([]);
    expect(allocateInvoicePayment([bill(1, "110.00")], Number.NaN).posted).toEqual([]);
  });
});
