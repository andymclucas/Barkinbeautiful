import { describe, expect, it } from "vitest";
import {
  decideAppointmentInvoice, groomInvoiceNumber, invoiceDueAt, invoiceStatusForPayments,
  type InvoiceDecisionInput,
} from "../shared/appointmentInvoicing";

const base: InvoiceDecisionInput = {
  price: "145.00",
  membershipId: null,
  existingInvoiceCount: 0,
  workflowState: "complete",
  status: "confirmed",
};

describe("decideAppointmentInvoice", () => {
  it("invoices a completed, priced, non-membership groom", () => {
    expect(decideAppointmentInvoice(base)).toEqual({ invoice: true, bill: "everything" });
  });

  it("never raises a second invoice for the same appointment", () => {
    // The manual "Create Bills" button had no such guard: pressing it twice
    // billed the client twice for one groom.
    expect(decideAppointmentInvoice({ ...base, existingInvoiceCount: 1 }))
      .toEqual({ invoice: false, reason: "already_invoiced" });
  });

  it("does not invoice a membership groom with nothing added", () => {
    // The weekly membership charge already covers it. Billing the
    // appointment too charges twice and double-counts the revenue.
    expect(decideAppointmentInvoice({ ...base, membershipId: 3 }))
      .toEqual({ invoice: false, reason: "membership_covered" });
  });

  it("does not invoice a membership groom even when it carries a price", () => {
    expect(decideAppointmentInvoice({ ...base, membershipId: 3, price: "290.00" }).invoice).toBe(false);
  });

  it("does not invoice without a price", () => {
    for (const price of [null, undefined, "", "0.00", 0]) {
      expect(decideAppointmentInvoice({ ...base, price }))
        .toEqual({ invoice: false, reason: "no_price" });
    }
  });

  it("does not invoice a negative price", () => {
    expect(decideAppointmentInvoice({ ...base, price: "-10.00" }).invoice).toBe(false);
  });

  it("does not invoice unless the groom actually happened", () => {
    for (const workflowState of ["scheduled", "bathing", "ready", "cancelled"]) {
      expect(decideAppointmentInvoice({ ...base, workflowState }))
        .toEqual({ invoice: false, reason: "not_complete" });
    }
  });

  it("does not invoice a cancelled or no-show booking", () => {
    expect(decideAppointmentInvoice({ ...base, status: "cancelled" }))
      .toEqual({ invoice: false, reason: "cancelled" });
    expect(decideAppointmentInvoice({ ...base, status: "no_show" }))
      .toEqual({ invoice: false, reason: "cancelled" });
  });

  it("checks already-invoiced before anything else, so a re-run is always a no-op", () => {
    expect(decideAppointmentInvoice({
      ...base, existingInvoiceCount: 2, status: "cancelled", workflowState: "scheduled", price: null,
    })).toEqual({ invoice: false, reason: "already_invoiced" });
  });

  it("handles a price that is not a number rather than billing NaN", () => {
    expect(decideAppointmentInvoice({ ...base, price: "not a price" }).invoice).toBe(false);
  });
});

describe("invoiceStatusForPayments", () => {
  it("marks it paid when the money is already in", () => {
    expect(invoiceStatusForPayments("145.00", "145.00")).toBe("paid");
    expect(invoiceStatusForPayments("145.00", "200.00")).toBe("paid");
  });

  it("leaves it draft when nothing or only part has been paid", () => {
    expect(invoiceStatusForPayments("145.00", "0")).toBe("draft");
    expect(invoiceStatusForPayments("145.00", "100.00")).toBe("draft");
  });

  it("does not leave an invoice unpaid over a rounding cent", () => {
    expect(invoiceStatusForPayments("145.00", "144.999")).toBe("paid");
  });

  it("is draft for a zero total, which should not have been invoiced anyway", () => {
    expect(invoiceStatusForPayments("0", "0")).toBe("draft");
  });
});

describe("groomInvoiceNumber", () => {
  it("matches the shape Create Bills already produces", () => {
    // 19 Aug 2026 Brisbane
    const n = groomInvoiceNumber("Link", new Date("2026-08-19T00:00:00+10:00"), "a1b2");
    expect(n).toBe("GROOM-LINK-190826-A1B2");
  });

  it("uses the Brisbane day, not the server's", () => {
    // 09:00 Brisbane on the 19th is 23:00 UTC on the 18th.
    const n = groomInvoiceNumber("Link", new Date("2026-08-18T23:00:00Z"), "zz");
    expect(n).toContain("190826");
  });

  it("copes with punctuation and long names", () => {
    expect(groomInvoiceNumber("Rose-byrne", new Date("2026-01-02T12:00:00+10:00"), "x"))
      .toBe("GROOM-ROSE-BYR-020126-X");
    expect(groomInvoiceNumber(null, new Date("2026-01-02T12:00:00+10:00"), "x"))
      .toBe("GROOM-PET-020126-X");
  });
});

describe("invoiceDueAt", () => {
  it("is fourteen days out", () => {
    const from = new Date("2026-10-06T00:00:00Z");
    expect(invoiceDueAt(from).toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});

describe("add-ons make an otherwise unbillable groom billable", () => {
  const base = {
    membershipId: null, existingInvoiceCount: 0,
    workflowState: "complete", status: "confirmed",
  };

  it("bills a groom with no price when a real add-on was done", () => {
    // Appointment 210003 in production is exactly this: complete, no
    // membership, price NULL. Before add-ons existed there was genuinely
    // nothing to bill; a $65 teeth clean changes that.
    expect(decideAppointmentInvoice({ ...base, price: null, addOnsTotal: "65.00" }))
      .toEqual({ invoice: true, bill: "everything" });
  });

  it("still skips a groom with no price and no add-ons", () => {
    expect(decideAppointmentInvoice({ ...base, price: null, addOnsTotal: "0.00" }))
      .toEqual({ invoice: false, reason: "no_price" });
    expect(decideAppointmentInvoice({ ...base, price: null }))
      .toEqual({ invoice: false, reason: "no_price" });
  });

  it("adds the extras to a priced groom", () => {
    expect(decideAppointmentInvoice({ ...base, price: "95.00", addOnsTotal: "35.00" }))
      .toEqual({ invoice: true, bill: "everything" });
  });

  it("bills a membership groom for its extras, and only its extras", () => {
    // Andy, 07/10/2026: "Yes, invoice membership clients for extras." The
    // membership buys a groom every N weeks; it does not buy a $65 teeth
    // clean done on the day, and those were being given away silently.
    expect(decideAppointmentInvoice({ ...base, membershipId: 12, price: null, addOnsTotal: "65.00" }))
      .toEqual({ invoice: true, bill: "extras_only" });
  });

  it("will not charge a membership groom twice, even if it carries a price", () => {
    // A membership groom should have no price. If one ever does, the
    // decision must still say extras_only — otherwise the client pays
    // weekly for the groom AND gets an invoice for it.
    expect(decideAppointmentInvoice({ ...base, membershipId: 12, price: "290.00", addOnsTotal: "65.00" }))
      .toEqual({ invoice: true, bill: "extras_only" });
  });

  it("still refuses a cancelled appointment with add-ons on it", () => {
    expect(decideAppointmentInvoice({ ...base, status: "cancelled", price: "95.00", addOnsTotal: "35.00" }))
      .toEqual({ invoice: false, reason: "cancelled" });
  });
});
