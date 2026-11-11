import { describe, expect, it } from "vitest";
import { isMoegoInvoice, portalInvoicePayable } from "./portalInvoicePay";

describe("which bills a client can pay in the portal", () => {
  const open = { status: "draft", invoiceNumber: "GROOM-20261111-0001", fromMoego: false, owedCents: 11000 };

  it("offers an open Groomigo bill with money owing", () => {
    expect(portalInvoicePayable(open)).toBe(true);
    expect(portalInvoicePayable({ ...open, invoiceNumber: "SHOP-20261111-0001", status: "sent" })).toBe(true);
  });

  it("never offers a MoeGo bill, by number or by its booking", () => {
    expect(portalInvoicePayable({ ...open, invoiceNumber: "INV-M-103887367" })).toBe(false);
    expect(portalInvoicePayable({ ...open, fromMoego: true })).toBe(false);
    expect(isMoegoInvoice("GROOM-1", "136610990")).toBe(true);
    expect(isMoegoInvoice("GROOM-1", null)).toBe(false);
  });

  it("never offers a paid or cancelled bill", () => {
    expect(portalInvoicePayable({ ...open, status: "paid" })).toBe(false);
    expect(portalInvoicePayable({ ...open, status: "cancelled" })).toBe(false);
  });

  it("never offers a bill with nothing owing", () => {
    expect(portalInvoicePayable({ ...open, owedCents: 0 })).toBe(false);
    expect(portalInvoicePayable({ ...open, owedCents: null })).toBe(false);
  });
});
