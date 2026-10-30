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
