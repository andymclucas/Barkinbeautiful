import { describe, it, expect } from "vitest";
import { buildInvoiceEmail, formatMoney, allocatePayments, type InvoiceEmailInput } from "@shared/invoiceEmail";

const SALON = {
  name: "Barkin Beautiful",
  abn: "50 517 623 260",
  address: "Shop 2/11 Dan Street, Capalaba QLD 4157",
  phone: "07 3823 4567",
  email: "info@barkinbeautiful.com.au",
  brandPrimary: "#e70f76",
  brandAccent: "#ffd2dd",
};

const base: InvoiceEmailInput = {
  salon: SALON,
  clientName: "Marie Hodson",
  invoiceNumber: "INV-1042",
  issuedOn: "30 October 2026",
  dueOn: "6 November 2026",
  serviceOn: "30 October 2026",
  lines: [
    { description: "Bath", quantity: 1, amount: 75, petName: "Belle" },
    { description: "Bath", quantity: 1, amount: 75, petName: "Pippa" },
  ],
  total: 150,
  amountPaid: 0,
};

describe("buildInvoiceEmail", () => {
  it("is headed as a tax invoice and names the salon, not Groomigo", () => {
    const { html, subject } = buildInvoiceEmail(base);
    expect(html).toContain("TAX INVOICE");
    expect(html).toContain("Barkin Beautiful");
    expect(html).not.toContain("Groomigo");
    expect(subject).toBe("Your invoice from Barkin Beautiful — INV-1042");
  });

  it("paints itself in the salon's brand colour", () => {
    expect(buildInvoiceEmail(base).html).toContain("#e70f76");
  });

  /** The next salon's invoice must not come out pink. */
  it("falls back to neutral colours for a salon with none set", () => {
    const html = buildInvoiceEmail({
      ...base, salon: { ...SALON, brandPrimary: null, brandAccent: null },
    }).html;
    expect(html).not.toContain("#e70f76");
    expect(html).toContain("#7c5cff");
  });

  it("refuses a colour that is not a plain hex, rather than putting it in a style attribute", () => {
    const html = buildInvoiceEmail({
      ...base,
      salon: { ...SALON, brandPrimary: "red;background:url(javascript:alert(1))" },
    }).html;
    expect(html).not.toContain("javascript:");
    expect(html).toContain("#7c5cff");
  });

  it("shows GST backed out of the inclusive total", () => {
    const { html } = buildInvoiceEmail(base);
    expect(html).toContain("$136.36");   // ex GST
    expect(html).toContain("$13.64");    // GST
    expect(html).toContain("$150.00");   // total
    expect(html).toContain("All prices include GST.");
  });

  it("carries the ABN and address", () => {
    const { html } = buildInvoiceEmail(base);
    expect(html).toContain("ABN 50 517 623 260");
    expect(html).toContain("Shop 2/11 Dan Street, Capalaba QLD 4157");
  });

  it("omits the ABN line entirely when the salon has not set one", () => {
    const { html } = buildInvoiceEmail({ ...base, salon: { ...SALON, abn: null } });
    expect(html).not.toContain("ABN");
  });

  it("lists a line per dog, so a two-dog bill is legible", () => {
    const { html } = buildInvoiceEmail(base);
    expect(html).toContain("Belle");
    expect(html).toContain("Pippa");
  });

  it("shows a quantity only when there is more than one", () => {
    const one = buildInvoiceEmail(base).html;
    expect(one).not.toContain("&times;");
    const two = buildInvoiceEmail({
      ...base, lines: [{ description: "Ultra teeth", quantity: 2, amount: 30 }],
    }).html;
    expect(two).toContain("&times;2");
  });

  it("says Grooming services rather than nothing when a bill has no lines", () => {
    expect(buildInvoiceEmail({ ...base, lines: [] }).html).toContain("Grooming services");
  });
});

describe("what is still owed", () => {
  it("is the total when nothing has been paid", () => {
    const r = buildInvoiceEmail(base);
    expect(r.amountDue).toBe(150);
    expect(r.paidInFull).toBe(false);
    expect(r.html).toContain("$150.00 DUE");
  });

  it("becomes a receipt once it is settled", () => {
    const r = buildInvoiceEmail({ ...base, amountPaid: 150 });
    expect(r.paidInFull).toBe(true);
    expect(r.amountDue).toBe(0);
    expect(r.subject).toBe("Your receipt from Barkin Beautiful — INV-1042");
    expect(r.html).toContain("PAID IN FULL");
    expect(r.html).toContain("here is your receipt");
  });

  it("shows what is left after a part payment", () => {
    const r = buildInvoiceEmail({ ...base, amountPaid: 50 });
    expect(r.amountDue).toBe(100);
    expect(r.paidInFull).toBe(false);
    expect(r.html).toContain("&minus;$50.00");
    expect(r.html).toContain("$100.00 DUE");
  });

  /**
   * Floating point leaves a fraction of a cent on bills that are in
   * fact settled. "Amount due $0.00" in orange on a paid invoice is
   * worse than no email at all.
   */
  it("treats a settled bill as settled despite floating point", () => {
    const r = buildInvoiceEmail({ ...base, total: 0.1 + 0.2, amountPaid: 0.3 });
    expect(r.amountDue).toBe(0);
    expect(r.paidInFull).toBe(true);
  });

  it("never shows a negative amount due when somebody overpaid", () => {
    const r = buildInvoiceEmail({ ...base, amountPaid: 200 });
    expect(r.amountDue).toBe(0);
    expect(r.paidInFull).toBe(true);
  });

  /** A membership groom carries no price. It is not a paid receipt. */
  it("does not call a zero-total bill paid in full", () => {
    const r = buildInvoiceEmail({ ...base, total: 0, amountPaid: 0, lines: [] });
    expect(r.paidInFull).toBe(false);
  });

  it("hides the due date once it is paid", () => {
    expect(buildInvoiceEmail({ ...base, amountPaid: 150 }).html).not.toContain("6 November 2026");
    expect(buildInvoiceEmail(base).html).toContain("6 November 2026");
  });
});

describe("escaping", () => {
  it("escapes a dog's name rather than letting it close a tag", () => {
    const { html } = buildInvoiceEmail({
      ...base,
      lines: [{ description: "Bath", quantity: 1, amount: 75, petName: "<script>alert(1)</script>" }],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the client's name in the greeting", () => {
    const { html } = buildInvoiceEmail({ ...base, clientName: '"><img src=x onerror=alert(1)>' });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&quot;&gt;&lt;img");
  });

  it("leaves an apostrophe readable but escaped", () => {
    const { html } = buildInvoiceEmail({ ...base, clientName: "O'Malley" });
    expect(html).toContain("O&#39;Malley");
  });

  it("escapes the salon's own fields too", () => {
    const { html } = buildInvoiceEmail({
      ...base, salon: { ...SALON, name: "Dogs & <b>Co</b>" },
    });
    expect(html).toContain("Dogs &amp; &lt;b&gt;Co&lt;/b&gt;");
  });
});

describe("formatMoney", () => {
  it("is dollars and cents", () => {
    expect(formatMoney(75)).toBe("$75.00");
    expect(formatMoney(8.5)).toBe("$8.50");
  });

  it("groups thousands, for a household with several dogs on one bill", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });

  it("is zero rather than NaN for a missing figure", () => {
    expect(formatMoney(NaN)).toBe("$0.00");
  });
});

describe("the greeting", () => {
  it("uses the first name only", () => {
    expect(buildInvoiceEmail(base).html).toContain("Hi Marie,");
  });

  it("falls back politely when there is no name", () => {
    expect(buildInvoiceEmail({ ...base, clientName: null }).html).toContain("Hi there,");
    expect(buildInvoiceEmail({ ...base, clientName: "   " }).html).toContain("Hi there,");
  });
});

/**
 * Payments are recorded against the BOOKING, not an individual bill, so
 * a household billed with "Separate Bills" has two invoices and one sum
 * of money. Handing it all to the first printed "Paid -$170.00" on an
 * $80 invoice and told the client the other $90 was still owing when
 * they had in fact paid.
 */
describe("allocatePayments", () => {
  it("fills the first bill, then the next", () => {
    expect(allocatePayments([80, 90], 170)).toEqual([80, 90]);
    expect(allocatePayments([80, 90], 100)).toEqual([80, 20]);
    expect(allocatePayments([80, 90], 0)).toEqual([0, 0]);
  });

  it("never hands a bill more than it is worth", () => {
    expect(allocatePayments([80, 90], 500)).toEqual([80, 90]);
  });

  it("adds back up to what was taken", () => {
    for (const paid of [0, 15.55, 80, 169.99, 170]) {
      const parts = allocatePayments([80, 90], paid);
      const sum = parts.reduce((cents, part) => cents + Math.round(part * 100), 0) / 100;
      expect(sum, `paid ${paid}`).toBe(Math.min(paid, 170));
    }
  });

  it("works in cents, not floating point", () => {
    expect(allocatePayments([0.1, 0.2], 0.30000000000000004)).toEqual([0.1, 0.2]);
  });

  it("is unchanged for the ordinary one-bill booking", () => {
    expect(allocatePayments([186], 186)).toEqual([186]);
    expect(allocatePayments([186], 50)).toEqual([50]);
  });

  it("treats a missing total as nothing owed rather than NaN", () => {
    expect(allocatePayments([NaN, 90], 90)).toEqual([0, 90]);
  });
});
