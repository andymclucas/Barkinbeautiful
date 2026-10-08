import { describe, expect, it } from "vitest";
import { nextBillingSecondsFromInvoice, nextBillingDateFromInvoice } from "@shared/stripeInvoicePeriod";

const OCT_8 = 1791438698;   // 2026-10-07T19:51:38Z — the moment of the charge
const OCT_15 = OCT_8 + 7 * 24 * 60 * 60;

describe("reading the next billing date off a paid invoice", () => {
  it("takes the subscription period from the line, not the invoice's own window", () => {
    // The real shape from 08/10/2026: a first invoice whose own period
    // collapses to the instant it was created, while the line carries the
    // week actually paid for. Preferring the invoice wrote "today".
    const firstInvoice = {
      period_end: OCT_8,
      lines: { data: [{ period: { start: OCT_8, end: OCT_15 } }] },
    };
    expect(nextBillingSecondsFromInvoice(firstInvoice)).toBe(OCT_15);
    expect(nextBillingDateFromInvoice(firstInvoice)?.toISOString()).toBe(
      new Date(OCT_15 * 1000).toISOString(),
    );
  });

  it("falls back to the invoice window when there are no subscription lines", () => {
    expect(nextBillingSecondsFromInvoice({ period_end: OCT_15, lines: { data: [] } })).toBe(OCT_15);
    expect(nextBillingSecondsFromInvoice({ period_end: OCT_15 })).toBe(OCT_15);
  });

  it("returns null rather than a date when neither is readable", () => {
    // Null means leave the stored date alone. Blanking Next Billing because
    // one webhook arrived in an unfamiliar shape would be worse than stale.
    expect(nextBillingSecondsFromInvoice({})).toBeNull();
    expect(nextBillingSecondsFromInvoice({ period_end: null, lines: null })).toBeNull();
    expect(nextBillingSecondsFromInvoice({ period_end: 0 })).toBeNull();
    expect(nextBillingDateFromInvoice({})).toBeNull();
  });

  it("ignores a line with no period and uses the invoice", () => {
    expect(nextBillingSecondsFromInvoice({
      period_end: OCT_15, lines: { data: [{ period: null }] },
    })).toBe(OCT_15);
  });
});
