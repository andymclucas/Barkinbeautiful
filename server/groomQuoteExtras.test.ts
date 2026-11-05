import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { approvedQuoteExtrasTotal } from "./groomQuoteExtras";
import { decideAppointmentInvoice } from "../shared/appointmentInvoicing";
import { buildInvoiceLines } from "../shared/appointmentAddOns";

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

describe("a membership dog with one agreed extra, end to end", () => {
  /*
   * The three pieces the invoice paths use, composed the way routers.ts
   * composes them. Each is tested alone elsewhere; this asserts the NUMBER
   * that reaches the client, which is the only thing they actually care
   * about and the thing no single-unit test states.
   *
   * The case is the one from Andy, 07/10/2026: the weekly membership pays
   * for the groom, so the groom bills nothing, but the de-matting agreed
   * on the day is charged in full.
   */
  const extras = [{ description: "De-matting", amount: "60.00" }];

  it("raises an invoice for exactly the extra, with the groom at zero", () => {
    // Exactly what loadApprovedQuoteExtras hands over: the raw line, not
    // an invoice-formatted one. Formatting it here too is the bug this
    // test caught — see ApprovedQuoteExtra.description.
    const loaded = extras;

    const decision = decideAppointmentInvoice({
      price: null,
      membershipId: 12,
      existingInvoiceCount: 0,
      workflowState: "complete",
      status: "confirmed",
      addOnsTotal: "0.00",
      approvedExtrasTotal: approvedQuoteExtrasTotal(loaded),
    });
    expect(decision).toEqual({ invoice: true, bill: "extras_only" });

    const itemised = buildInvoiceLines({
      petName: "Link",
      serviceLabel: "Styled Groom",
      servicePrice: null,
      addOns: [],
      membershipCovered: decision.invoice && decision.bill === "extras_only",
      approvedExtras: loaded,
    });

    // The groom still gets a line, at zero. A membership client opening a
    // bill for $60 has to be able to see what it was on top of.
    expect(itemised.lines[0].lineTotal).toBe("0.00");
    expect(itemised.lines[0].description).toContain("covered by membership");

    // And the extra is charged in full, named so they recognise it.
    expect(itemised.lines[1].description).toBe("Link — De-matting (agreed on the day)");
    expect(itemised.lines[1].lineTotal).toBe("60.00");

    expect(itemised.subtotal).toBe("60.00");
    expect(itemised.subtotalCents).toBe(6000);
  });

  it("charges nothing at all when the owner never answered", () => {
    // The same dog, same found matting, no reply. loadApprovedQuoteExtras
    // returns [] because the quote is not `approved`, and the salon is
    // back to a membership groom with nothing on it — which raises no
    // invoice rather than a $0 one nobody can explain.
    expect(decideAppointmentInvoice({
      price: null,
      membershipId: 12,
      existingInvoiceCount: 0,
      workflowState: "complete",
      status: "confirmed",
      addOnsTotal: "0.00",
      approvedExtrasTotal: approvedQuoteExtrasTotal([]),
    })).toEqual({ invoice: false, reason: "membership_covered" });
  });
});
