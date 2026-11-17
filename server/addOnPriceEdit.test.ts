import { describe, it, expect } from "vitest";
import { readUnitPriceEdit } from "../shared/addOnPriceEdit";
import { validateLineDiscount } from "../shared/lineDiscount";

describe("readUnitPriceEdit", () => {
  it("reads a new price — Lauren's daycare at $20", () => {
    expect(readUnitPriceEdit("20", "35.00")).toEqual({ ok: true, unitPrice: 20, changed: true });
  });

  it("is not a change when the figure is the same, however it is typed", () => {
    // Saving "done by" must not rewrite the price.
    expect(readUnitPriceEdit("35.00", "35.00")).toEqual({ ok: true, unitPrice: 35, changed: false });
    expect(readUnitPriceEdit(" $35 ", "35.00")).toEqual({ ok: true, unitPrice: 35, changed: false });
  });

  it("allows zero, for a line that is not being charged", () => {
    expect(readUnitPriceEdit("0", "35.00")).toEqual({ ok: true, unitPrice: 0, changed: true });
  });

  it("rounds to the cent", () => {
    expect(readUnitPriceEdit("19.999", "35.00")).toEqual({ ok: true, unitPrice: 20, changed: true });
  });

  it("refuses an empty box, a word, a negative and an absurd figure", () => {
    expect(readUnitPriceEdit("", "35.00").ok).toBe(false);
    expect(readUnitPriceEdit("twenty", "35.00").ok).toBe(false);
    expect(readUnitPriceEdit("-5", "35.00").ok).toBe(false);
    expect(readUnitPriceEdit("10001", "35.00").ok).toBe(false);
  });

  it("a discount already on the line is checked against the NEW price", () => {
    // $25 off was fine on a $35 line and is not on a $20 one. The editor
    // feeds the new gross to the discount check, as the server does.
    const edit = readUnitPriceEdit("20", "35.00");
    if (!edit.ok) throw new Error("expected a price");
    const check = validateLineDiscount({
      kind: "amount", value: "25", reason: "agreed", gross: (edit.unitPrice * 1).toFixed(2),
    });
    expect(check.ok).toBe(false);
  });
});
