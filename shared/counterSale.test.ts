import { describe, expect, it } from "vitest";
import {
  counterSaleInvoiceNumber,
  counterSaleLineTotal,
  counterSaleRefusal,
  counterSaleStatus,
  counterSaleTotals,
  describeCounterSale,
  MAX_COUNTER_SALE_LINES,
  MAX_LINE_QUANTITY,
  type CounterSaleLine,
} from "./counterSale";

const line = (over: Partial<CounterSaleLine> = {}): CounterSaleLine => ({
  retailProductId: 1,
  name: "Oatmeal shampoo",
  unitPrice: "24.95",
  quantity: 1,
  ...over,
});

describe("what a counter sale comes to", () => {
  it("multiplies to the cent", () => {
    expect(counterSaleLineTotal({ unitPrice: "24.95", quantity: 3 })).toBe(
      "74.85"
    );
  });

  it("adds the lines in cents, not in floats", () => {
    /*
     * 0.1 + 0.2 is 0.30000000000000004. Three of these added as numbers
     * and then rounded is still 0.70 by luck; the case that bites is a
     * long receipt, so this is the one that matters:
     */
    const lines = Array.from({ length: 7 }, () => line({ unitPrice: "0.10" }));
    expect(counterSaleTotals(lines).total).toBe("0.70");
  });

  it("agrees with the sum of its own printed lines", () => {
    // A receipt whose total is a cent off its lines is a receipt the
    // person at the counter has to argue about.
    const lines = [
      line({ unitPrice: "12.95", quantity: 2 }),
      line({
        retailProductId: 2,
        name: "Dental chews",
        unitPrice: "8.50",
        quantity: 3,
      }),
      line({
        retailProductId: 3,
        name: "Bandana",
        unitPrice: "6.00",
        quantity: 1,
      }),
    ];
    const printed = lines
      .map(l => Number(counterSaleLineTotal(l)))
      .reduce((a, b) => a + b, 0);
    expect(counterSaleTotals(lines).total).toBe(printed.toFixed(2));
  });

  it("carries no tax, because no invoice in this app ever has", () => {
    // The salon's prices are GST-inclusive. Stated here so a future
    // change is a deliberate one across every invoice path, not a
    // surprise that this one path disagrees.
    const totals = counterSaleTotals([line()]);
    expect(totals.taxAmount).toBe("0");
    expect(totals.total).toBe(totals.subtotal);
  });

  it("is 0.00 for an empty sale rather than NaN", () => {
    expect(counterSaleTotals([])).toEqual({
      subtotal: "0.00",
      taxAmount: "0",
      total: "0.00",
    });
  });

  it("treats an unreadable price as zero rather than poisoning the total", () => {
    // A null price on a catalogue row should cost the client nothing and
    // must not turn the whole receipt into NaN.
    const lines = [
      line({ unitPrice: "" }),
      line({ retailProductId: 2, unitPrice: "10.00" }),
    ];
    expect(counterSaleTotals(lines).total).toBe("10.00");
  });
});

describe("what cannot be sold", () => {
  it("refuses an empty sale", () => {
    expect(counterSaleRefusal([])).toMatch(/add something/i);
  });

  it("allows a full-length receipt and refuses one line more", () => {
    const full = Array.from({ length: MAX_COUNTER_SALE_LINES }, (_, i) =>
      line({ retailProductId: i + 1 })
    );
    expect(counterSaleRefusal(full)).toBeNull();
    expect(
      counterSaleRefusal([...full, line({ retailProductId: 99 })])
    ).toContain("20 lines");
  });

  it("refuses a quantity that is not a whole number of things", () => {
    expect(counterSaleRefusal([line({ quantity: 1.5 })])).toMatch(/at least 1/);
    expect(counterSaleRefusal([line({ quantity: 0 })])).toMatch(/at least 1/);
  });

  it("names the product in the refusal", () => {
    // The person reading this is at the counter with a client waiting.
    const refusal = counterSaleRefusal([
      line({ name: "Dental chews", quantity: MAX_LINE_QUANTITY + 1 }),
    ]);
    expect(refusal).toContain("Dental chews");
  });

  it("allows a $0 line, because a giveaway still comes off the shelf", () => {
    expect(counterSaleRefusal([line({ unitPrice: "0.00" })])).toBeNull();
  });

  it("refuses a negative price", () => {
    // A refund is not a sale with a minus sign in front of it.
    expect(counterSaleRefusal([line({ unitPrice: "-5.00" })])).toMatch(
      /negative/
    );
  });
});

describe("the receipt number", () => {
  it("uses the BRISBANE day, not the server's", () => {
    /*
     * 10/11/2026 00:30 Brisbane is 09/11/2026 14:30 UTC. A number built
     * from the UTC date would file the first sale of the morning under
     * yesterday — the same class of bug as CURDATE() reading UTC.
     */
    const at = new Date("2026-11-09T14:30:00Z");
    expect(counterSaleInvoiceNumber(at, "ab12")).toBe("SHOP-101126-AB12");
  });

  it("shouts the unique part, so it can be read back over a phone", () => {
    expect(
      counterSaleInvoiceNumber(new Date("2026-11-10T02:00:00Z"), "k9z")
    ).toBe("SHOP-101126-K9Z");
  });
});

describe("the description", () => {
  it("counts only where there is more than one", () => {
    expect(
      describeCounterSale([
        line({ name: "Bandana", quantity: 1 }),
        line({ retailProductId: 2, name: "Dental chews", quantity: 3 }),
      ])
    ).toBe("Bandana, 3 × Dental chews");
  });

  it("says something for an empty sale rather than nothing", () => {
    expect(describeCounterSale([])).toBe("Counter sale");
  });
});

describe("whether the bill is already settled", () => {
  it("is paid when the money was taken at the counter", () => {
    expect(counterSaleStatus(true)).toBe("paid");
  });

  it("is a draft bill when it was not", () => {
    expect(counterSaleStatus(false)).toBe("draft");
  });
});
