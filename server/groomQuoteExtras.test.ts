import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { approvedQuoteExtrasTotal } from "./groomQuoteExtras";

describe("approvedQuoteExtrasTotal", () => {
  it("adds in cents, so a bill never disagrees with the quote by a cent", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point. An owner who was
    // quoted $0.30 and billed $0.30000000000000004 notices, and nobody can
    // explain it.
    expect(approvedQuoteExtrasTotal([
      { description: "a", amount: "0.10" },
      { description: "b", amount: "0.20" },
    ])).toBe("0.30");
  });

  it("is zero for a dog with nothing agreed", () => {
    // Every appointment in the salon's history. Must read as a plain zero
    // so decideAppointmentInvoice behaves exactly as it did before.
    expect(approvedQuoteExtrasTotal([])).toBe("0.00");
  });

  it("adds several lines", () => {
    expect(approvedQuoteExtrasTotal([
      { description: "De-matting", amount: "40.00" },
      { description: "Ear clean", amount: "20.50" },
    ])).toBe("60.50");
  });

  it("ignores a line whose amount is not a number rather than returning NaN", () => {
    // A NaN total propagates into decideAppointmentInvoice, where every
    // comparison against it is false — so the appointment silently stops
    // being billable. Dropping the junk line is wrong too, but it is wrong
    // in a direction somebody can see on the invoice.
    expect(approvedQuoteExtrasTotal([
      { description: "De-matting", amount: "40.00" },
      { description: "Broken", amount: "not a number" },
    ])).toBe("40.00");
  });
});

describe("the loader cannot quietly widen to unapproved quotes", () => {
  /*
   * Comments stripped first. The file's own prose explains why it never
   * falls back to "sent", and asserting over that would fail on the
   * explanation rather than on the query — which is how a structural test
   * ends up pinning its own documentation.
   */
  const source = readFileSync(resolve(process.cwd(), "server/groomQuoteExtras.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  /*
   * A structural check, which CLAUDE.md §7 allows only to prove delegation
   * — and that is what this is. The rule being protected is not about
   * rendering and cannot be reached without a database: this loader is the
   * single place that decides which quotes become money.
   *
   * The failure it guards is a plausible future edit, not a hypothetical.
   * "The groomer did the work, the owner just didn't tap the link, let's
   * include sent ones too" is a reasonable-sounding change that would start
   * charging people who never agreed, and it would pass every other test in
   * this suite.
   */
  it("filters on approved and nothing else", () => {
    expect(source).toContain('eq(groomQuotes.status, "approved")');
    for (const status of ["draft", "sent", "declined", "expired", "withdrawn"]) {
      expect(source, `the invoice loader must never select ${status} quotes`)
        .not.toContain(`"${status}"`);
    }
    // One status filter, so a second cannot be ORed in beside it.
    expect(source.match(/eq\(groomQuotes\.status,/g)).toHaveLength(1);
    expect(source).not.toContain("inArray(groomQuotes.status");
    expect(source).not.toContain("or(");
  });

  it("scopes every read to one salon", () => {
    expect(source).toContain("eq(groomQuotes.tenantId, tenantId)");
    expect(source).toContain("eq(groomQuoteLines.tenantId, groomQuotes.tenantId)");
  });
});
