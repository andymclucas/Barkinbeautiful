import { describe, it, expect } from "vitest";
import {
  describeInvoiceEmailPrompt, looksLikeEmail, type InvoiceEmailTarget,
} from "@shared/invoiceEmailPrompt";

const withEmail: InvoiceEmailTarget = {
  ready: true,
  invoiceNumber: "INV-1042",
  clientName: "Marie Hodson",
  email: "marie@example.com",
  total: 186,
  amountDue: 186,
  paidInFull: false,
};

describe("when the client has an email", () => {
  it("asks the question Andy asked for, naming the address", () => {
    const p = describeInvoiceEmailPrompt(withEmail);
    expect(p.title).toBe("Email invoice to Marie Hodson?");
    expect(p.body).toContain("marie@example.com");
    expect(p.body).toContain("INV-1042");
    expect(p.needsEmail).toBe(false);
    expect(p.canSend).toBe(true);
  });

  it("states what is owed", () => {
    expect(describeInvoiceEmailPrompt(withEmail).body).toContain("$186.00 due");
  });

  it("calls a settled bill a receipt, not an invoice", () => {
    const p = describeInvoiceEmailPrompt({ ...withEmail, amountDue: 0, paidInFull: true });
    expect(p.title).toBe("Email receipt to Marie Hodson?");
    expect(p.body).toContain("paid in full");
    expect(p.confirmLabel).toBe("Email receipt");
  });

  it("falls back politely when the client has no name", () => {
    expect(describeInvoiceEmailPrompt({ ...withEmail, clientName: null }).title)
      .toBe("Email invoice to this client?");
  });
});

describe("when the client has no email", () => {
  const noEmail: InvoiceEmailTarget = { ...withEmail, email: null };

  it("asks for one instead of refusing", () => {
    const p = describeInvoiceEmailPrompt(noEmail);
    expect(p.needsEmail).toBe(true);
    expect(p.title).toContain("No email for Marie Hodson");
    expect(p.body).toContain("Add one");
  });

  /** Otherwise the same address is retyped at every visit. */
  it("says the address will be saved to the client", () => {
    expect(describeInvoiceEmailPrompt(noEmail).body).toContain("saved to their record");
  });

  it("cannot send until an address is typed", () => {
    expect(describeInvoiceEmailPrompt(noEmail).canSend).toBe(false);
  });

  it("still says what the bill comes to", () => {
    expect(describeInvoiceEmailPrompt(noEmail).body).toContain("$186.00 due");
  });

  it("treats a blank string the same as missing", () => {
    expect(describeInvoiceEmailPrompt({ ...withEmail, email: "   " }).needsEmail).toBe(true);
  });
});

describe("when there is no bill", () => {
  it("names the button to press rather than just failing", () => {
    const p = describeInvoiceEmailPrompt({ ready: false, reason: "no-invoice", clientName: "Marie" });
    expect(p.canSend).toBe(false);
    expect(p.needsEmail).toBe(false);
    expect(p.body).toContain("Create Bill");
  });
});

describe("when it has been emailed before", () => {
  const already: InvoiceEmailTarget = {
    ...withEmail,
    emailedAt: new Date("2026-10-30T02:00:00Z"),
    emailedTo: "marie@example.com",
  };

  /**
   * A warning, not a block. "They say they never got it" is the normal
   * reason to press this twice, and refusing would send staff back to
   * their own mail client — which is the thing being replaced.
   */
  it("warns but still allows a resend", () => {
    const p = describeInvoiceEmailPrompt(already);
    expect(p.warning).toContain("Already emailed");
    expect(p.warning).toContain("marie@example.com");
    expect(p.canSend).toBe(true);
  });

  it("warns without an address when only the time was recorded", () => {
    const p = describeInvoiceEmailPrompt({ ...already, emailedTo: null });
    expect(p.warning).toBe("Already emailed. Sending again will replace that record.");
  });

  it("says nothing when it has not been sent", () => {
    expect(describeInvoiceEmailPrompt(withEmail).warning).toBeNull();
  });
});

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(looksLikeEmail("marie@example.com")).toBe(true);
    expect(looksLikeEmail("marie.hodson+dogs@mail.example.com.au")).toBe(true);
    expect(looksLikeEmail("  marie@example.com  ")).toBe(true);
  });

  it("rejects the obvious typos a counter produces", () => {
    expect(looksLikeEmail("marie@")).toBe(false);
    expect(looksLikeEmail("marie")).toBe(false);
    expect(looksLikeEmail("@example.com")).toBe(false);
    expect(looksLikeEmail("marie@example")).toBe(false);
    expect(looksLikeEmail("marie @example.com")).toBe(false);
    expect(looksLikeEmail("a@b@c.com")).toBe(false);
    expect(looksLikeEmail("marie@.com")).toBe(false);
    expect(looksLikeEmail("marie@example.")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });

  /** Being too strict costs a bill that cannot be sent at all. */
  it("does not reject unusual but valid addresses", () => {
    expect(looksLikeEmail("o'malley@example.com")).toBe(true);
    expect(looksLikeEmail("a_b-c@sub.domain.co")).toBe(true);
  });
});

/**
 * "Separate Bills" raises one invoice per dog. The box used to name one
 * of them and the send used to deliver only that one, marking the job
 * done — the second dog's bill would never have gone out and nothing on
 * screen would have said so.
 */
describe("a booking billed as separate bills", () => {
  const two: InvoiceEmailTarget = {
    ready: true,
    invoiceNumber: "GROOM-BELLE-301026",
    invoiceCount: 2,
    invoiceNumbers: ["GROOM-BELLE-301026", "GROOM-PIPPA-301026"],
    clientName: "Marie Hodson",
    email: "marie@example.com",
    total: 150,
    amountDue: 150,
    paidInFull: false,
  };

  it("says there are two, and names both", () => {
    const p = describeInvoiceEmailPrompt(two);
    expect(p.title).toBe("Email 2 bills to Marie Hodson?");
    expect(p.body).toContain("GROOM-BELLE-301026");
    expect(p.body).toContain("GROOM-PIPPA-301026");
    expect(p.body).toContain("Each will be emailed separately");
    expect(p.confirmLabel).toBe("Email 2 bills");
  });

  it("still reports the total owed across both", () => {
    expect(describeInvoiceEmailPrompt(two).body).toContain("$150.00 due");
  });

  it("asks for an address for both when the client has none", () => {
    const p = describeInvoiceEmailPrompt({ ...two, email: null });
    expect(p.needsEmail).toBe(true);
    expect(p.body).toContain("2 separate bills");
    expect(p.confirmLabel).toBe("Save and send 2 bills");
  });

  it("reads as a single invoice when there is only one", () => {
    const p = describeInvoiceEmailPrompt({ ...two, invoiceCount: 1, invoiceNumbers: ["GROOM-BELLE-301026"] });
    expect(p.title).toBe("Email invoice to Marie Hodson?");
    expect(p.confirmLabel).toBe("Email invoice");
  });

  /** Older callers that do not send a count must not suddenly pluralise. */
  it("treats a missing count as one", () => {
    const { invoiceCount, invoiceNumbers, ...noCount } = two;
    expect(describeInvoiceEmailPrompt(noCount as InvoiceEmailTarget).title)
      .toBe("Email invoice to Marie Hodson?");
  });
});

/**
 * The box has to quote the BOOKING's figures, not the first bill's.
 * Saying "$80.00, paid in full" while a second $90 bill is about to go
 * out unpaid would be worse than saying nothing at all.
 */
describe("figures on a booking with more than one bill", () => {
  const twoBills: InvoiceEmailTarget = {
    ready: true,
    invoiceNumber: "GROOM-BELLE",
    invoiceCount: 2,
    invoiceNumbers: ["GROOM-BELLE", "GROOM-PIPPA"],
    clientName: "Marie Hodson",
    email: "marie@example.com",
    // The FIRST bill only — this is what the old code quoted.
    total: 80,
    amountDue: 0,
    paidInFull: true,
    // The booking.
    bookingTotal: 170,
    bookingAmountDue: 90,
  };

  it("quotes what is owed across the booking, not the first bill", () => {
    const p = describeInvoiceEmailPrompt(twoBills);
    expect(p.body).toContain("$90.00 due");
    expect(p.body).not.toContain("paid in full");
  });

  it("calls them invoices, not receipts, while anything is owed", () => {
    expect(describeInvoiceEmailPrompt(twoBills).title).toContain("bills");
    expect(describeInvoiceEmailPrompt(twoBills).confirmLabel).toBe("Email 2 bills");
  });

  it("is a receipt once the whole booking is settled", () => {
    const p = describeInvoiceEmailPrompt({ ...twoBills, bookingAmountDue: 0 });
    expect(p.body).toContain("$170.00, paid in full");
  });

  it("falls back to the single-bill figures when no booking total is given", () => {
    const { bookingTotal, bookingAmountDue, ...single } = twoBills;
    const p = describeInvoiceEmailPrompt({ ...single, invoiceCount: 1, invoiceNumbers: ["GROOM-BELLE"] } as InvoiceEmailTarget);
    expect(p.body).toContain("$80.00, paid in full");
  });
});
