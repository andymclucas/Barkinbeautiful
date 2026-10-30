import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { INVOICE_EMAIL_ENABLED, INVOICE_EMAIL_HELD_MESSAGE } from "@shared/invoiceEmailGate";

/**
 * Andy, 30/10/2026: "Do not send out any invoices right now until
 * confirmed all is working and correct."
 *
 * The hold is a constant rather than an env var on purpose — the same
 * reasoning as the automated-SMS allow-list. These tests exist so that
 * turning it on is a deliberate act with a failing test in front of it,
 * rather than something that happens by accident in a refactor.
 */
describe("the invoice email hold", () => {
  it("is ON — nothing may be sent", () => {
    // If you are here because this failed: you are about to let real
    // invoices reach real clients. That needs Andy to have said the
    // figures check out, not just a green build.
    expect(INVOICE_EMAIL_ENABLED).toBe(false);
  });

  it("says why, without blaming the person who pressed it", () => {
    expect(INVOICE_EMAIL_HELD_MESSAGE).toContain("Nothing has been sent");
  });

  /**
   * A disabled button is a hint, not a gate: the procedure is reachable
   * by anyone signed in. This pins that the SERVER refuses, and that it
   * refuses before it loads anything — a hold that only wrapped the
   * Resend call would still stamp invoices as emailed.
   */
  it("is enforced in the mutation, before any work is done", () => {
    const src = readFileSync("server/routers/payments.ts", "utf8");
    const mutationAt = src.indexOf("emailInvoice: protectedProcedure");
    expect(mutationAt).toBeGreaterThan(-1);

    const body = src.slice(mutationAt, mutationAt + 2500);
    const gateAt = body.indexOf("INVOICE_EMAIL_ENABLED");
    const dbAt = body.indexOf("await getDb()");
    const sendAt = body.indexOf("sendEmail(");

    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(dbAt);
    if (sendAt > -1) expect(gateAt).toBeLessThan(sendAt);
  });
});
