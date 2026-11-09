import { describe, it, expect } from "vitest";
import {
  describeStockWarning, isRetailLine, stockAfterSale,
} from "@shared/retailSale";
import { addOnsTotal } from "@shared/appointmentAddOns";

/**
 * Andy, 09/11/2026: "Add retail items into the appointment card so
 * these can be added to the cart for checkout."
 */
describe("stockAfterSale", () => {
  it("takes the items off the shelf", () => {
    expect(stockAfterSale(10, 1).remaining).toBe(9);
    expect(stockAfterSale(10, 3).remaining).toBe(7);
  });

  it("says when that was the last one", () => {
    expect(stockAfterSale(1, 1)).toEqual({
      remaining: 0, warning: { kind: "last_one", remaining: 0 },
    });
    expect(stockAfterSale(3, 3).warning.kind).toBe("last_one");
  });

  /*
   * stock_qty is what somebody last typed in, not what is on the shelf.
   * Refusing a sale because the number says zero would stop a real sale
   * over a stale figure, in front of a client holding the thing.
   */
  it("still sells past zero, and says the count has gone wrong", () => {
    expect(stockAfterSale(0, 1)).toEqual({
      remaining: -1, warning: { kind: "oversold", remaining: -1 },
    });
    expect(stockAfterSale(2, 5).remaining).toBe(-3);
  });

  it("says nothing when there is plenty left", () => {
    expect(stockAfterSale(10, 1).warning).toEqual({ kind: "none" });
  });

  /* Every add must have exactly one matching restore, or the count
     drifts down for ever. */
  it("is exactly reversed by putting the items back", () => {
    for (const [stock, qty] of [[10, 1], [1, 1], [0, 3], [5, 5]]) {
      expect(stockAfterSale(stock, qty).remaining + qty).toBe(stock);
    }
  });
});

describe("describeStockWarning", () => {
  it("stays quiet when there is nothing to say", () => {
    expect(describeStockWarning({ kind: "none" }, "Dental Chews")).toBeNull();
  });

  it("names the product, because the counter is holding one", () => {
    expect(describeStockWarning({ kind: "last_one", remaining: 0 }, "Dental Chews"))
      .toBe("That was the last Dental Chews on the shelf.");
  });

  /* Named as a counting problem, not a sale problem: the sale happened
     and is on the bill; it is the number that is wrong. */
  it("reads as a recount rather than a refusal", () => {
    const line = describeStockWarning({ kind: "oversold", remaining: -2 }, "Shampoo");
    expect(line).toContain("Shampoo");
    expect(line).toContain("recount");
    expect(line).not.toMatch(/cannot|refused|error|failed/i);
  });
});

describe("isRetailLine", () => {
  it("tells a product line from a service add-on", () => {
    expect(isRetailLine({ retailProductId: 7, pricingServiceId: null })).toBe(true);
    expect(isRetailLine({ retailProductId: null, pricingServiceId: 3 })).toBe(false);
  });

  it("treats a line with neither as a service line", () => {
    // Quoted add-ons carry no catalogue id at all. Restocking against a
    // null product id is the one outcome that must not happen.
    expect(isRetailLine({ retailProductId: null, pricingServiceId: null })).toBe(false);
    expect(isRetailLine({})).toBe(false);
  });
});

/**
 * The reason a sale is a line in appointment_add_ons rather than a
 * table of its own: it has to reach the total the counter collects.
 */
describe("a retail line counts towards what is owed", () => {
  it("adds to the booking the same as any other extra", () => {
    const service = [{ unitPrice: "25.00", quantity: 1 }];
    const withProduct = [
      { unitPrice: "25.00", quantity: 1 },
      { unitPrice: "18.50", quantity: 2 },
    ];
    expect(addOnsTotal(service as any)).toBe("25.00");
    expect(addOnsTotal(withProduct as any)).toBe("62.00");
  });
});
