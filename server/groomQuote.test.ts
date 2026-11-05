import { describe, expect, it } from "vitest";
import {
  QUOTE_STATUSES, QUOTABLE_WORKFLOW_STATES, MAX_QUOTE_DOLLARS, QUOTE_EXPIRY_HOURS,
  canQuoteInWorkflowState, canTransitionQuote, canEditQuote, isQuoteBillable,
  isQuoteAwaitingAnswer, quoteTotal, validateQuoteLines, quoteExpiresAt,
  isQuoteExpired, requiresApprovalNote, describeQuoteStatus,
  type QuoteStatus,
} from "../shared/groomQuote";

/** The 12 appointment workflow states, from drizzle/schema.ts. */
const ALL_WORKFLOW_STATES = [
  "scheduled", "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry",
  "drying", "waiting_for_groom", "grooming", "ready", "complete",
  "cancelled", "no_show",
];

describe("when extra work may be quoted", () => {
  it("allows it for every state where the dog is at the salon and not gone home", () => {
    const allowed = ALL_WORKFLOW_STATES.filter(canQuoteInWorkflowState);
    expect(allowed).toEqual([
      "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry",
      "drying", "waiting_for_groom", "grooming", "ready",
    ]);
  });

  it("refuses the four states where a quote would be wrong", () => {
    // scheduled: nothing has been found yet, the dog is not here.
    // complete: the dog has gone home, so this would be a surprise charge —
    //           the exact thing the feature exists to prevent.
    for (const status of ["scheduled", "complete", "cancelled", "no_show"]) {
      expect(canQuoteInWorkflowState(status), status).toBe(false);
    }
  });

  it("counts the quotable states, so adding a workflow state cannot silently join the list", () => {
    expect(QUOTABLE_WORKFLOW_STATES).toHaveLength(8);
    expect(ALL_WORKFLOW_STATES).toHaveLength(12);
  });

  it("refuses a missing state rather than throwing", () => {
    expect(canQuoteInWorkflowState(null)).toBe(false);
    expect(canQuoteInWorkflowState(undefined)).toBe(false);
    expect(canQuoteInWorkflowState("")).toBe(false);
  });
});

describe("the quote state machine", () => {
  it("lets a draft be sent or withdrawn, and nothing else", () => {
    expect(canTransitionQuote("draft", "sent")).toBe(true);
    expect(canTransitionQuote("draft", "withdrawn")).toBe(true);
    expect(canTransitionQuote("draft", "approved")).toBe(false);
    expect(canTransitionQuote("draft", "declined")).toBe(false);
    expect(canTransitionQuote("draft", "expired")).toBe(false);
  });

  it("cannot approve a quote that was never sent", () => {
    // The owner has to have SEEN the figure. Approving a draft would create
    // an approved quote nobody was ever shown.
    expect(canTransitionQuote("draft", "approved")).toBe(false);
  });

  it("lets a sent quote be answered, time out, or be withdrawn", () => {
    for (const to of ["approved", "declined", "expired", "withdrawn"] as QuoteStatus[]) {
      expect(canTransitionQuote("sent", to), to).toBe(true);
    }
  });

  it("makes every answered state terminal", () => {
    for (const from of ["approved", "declined", "expired", "withdrawn"] as QuoteStatus[]) {
      for (const to of QUOTE_STATUSES) {
        expect(canTransitionQuote(from, to), ` -> `).toBe(false);
      }
    }
  });

  it("cannot revive a declined quote as approved", () => {
    // Otherwise "the owner said no" becomes editable into "the owner said
    // yes", which is the record this whole feature exists to keep.
    expect(canTransitionQuote("declined", "approved")).toBe(false);
    expect(canTransitionQuote("expired", "approved")).toBe(false);
  });
});

describe("the figure the owner saw cannot change", () => {
  it("allows editing only in draft", () => {
    expect(canEditQuote("draft")).toBe(true);
    for (const status of ["sent", "approved", "declined", "expired", "withdrawn"] as QuoteStatus[]) {
      expect(canEditQuote(status), status).toBe(false);
    }
  });
});

describe("what bills", () => {
  it("bills an approved quote and nothing else", () => {
    expect(isQuoteBillable("approved")).toBe(true);
    for (const status of ["draft", "sent", "declined", "expired", "withdrawn"] as QuoteStatus[]) {
      expect(isQuoteBillable(status), status).toBe(false);
    }
  });

  it("does not treat silence as consent", () => {
    // An owner who never answered has agreed to nothing.
    expect(isQuoteBillable("expired")).toBe(false);
  });

  it("knows when the groomer is still waiting", () => {
    expect(isQuoteAwaitingAnswer("sent")).toBe(true);
    expect(isQuoteAwaitingAnswer("approved")).toBe(false);
    expect(isQuoteAwaitingAnswer("draft")).toBe(false);
  });
});

describe("quoteTotal", () => {
  it("adds up the lines", () => {
    expect(quoteTotal([{ description: "De-matting", amount: "40.00" }])).toBe("40.00");
    expect(quoteTotal([
      { description: "De-matting", amount: 40 },
      { description: "Nails", amount: 15.5 },
    ])).toBe("55.50");
  });

  it("does not drift the way floating point does", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in IEEE 754. A quote total that
    // disagrees with the invoice by a cent is unexplainable to an owner.
    expect(quoteTotal([
      { description: "a", amount: 0.1 },
      { description: "b", amount: 0.2 },
    ])).toBe("0.30");
    const cents = Array.from({ length: 10 }, () => ({ description: "x", amount: 0.1 }));
    expect(quoteTotal(cents)).toBe("1.00");
  });

  it("takes numbers and strings alike, since one comes from a form and one from the database", () => {
    expect(quoteTotal([{ description: "a", amount: "12.34" }, { description: "b", amount: 7.66 }])).toBe("20.00");
  });

  it("is 0.00 for no lines rather than throwing", () => {
    expect(quoteTotal([])).toBe("0.00");
  });

  it("skips a junk amount rather than producing NaN", () => {
    expect(quoteTotal([{ description: "a", amount: "" }, { description: "b", amount: "10" }])).toBe("10.00");
  });
});

describe("validateQuoteLines", () => {
  it("accepts an ordinary quote", () => {
    expect(validateQuoteLines([{ description: "De-matting", amount: "40.00" }])).toEqual({ ok: true });
  });

  it("refuses an empty quote", () => {
    const r = validateQuoteLines([]);
    expect(r.ok).toBe(false);
  });

  it("refuses a line with no description", () => {
    const r = validateQuoteLines([{ description: "   ", amount: "40" }]);
    expect(r).toEqual({ ok: false, reason: "Every line needs a description" });
  });

  it("refuses a free or negative line", () => {
    expect(validateQuoteLines([{ description: "Nails", amount: "0" }]).ok).toBe(false);
    expect(validateQuoteLines([{ description: "Nails", amount: "-5" }]).ok).toBe(false);
  });

  it("refuses a price with a misplaced digit", () => {
    // 400 instead of 40, typed on a phone mid-groom with a wet dog. The
    // owner sees that figure before anybody notices.
    const r = validateQuoteLines([{ description: "De-matting", amount: "4000" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("check the figure");
  });

  it("allows exactly the limit", () => {
    expect(validateQuoteLines([{ description: "Big job", amount: String(MAX_QUOTE_DOLLARS) }]).ok).toBe(true);
  });

  it("applies the limit to the total, not line by line", () => {
    const lines = Array.from({ length: 11 }, () => ({ description: "x", amount: "100" }));
    expect(validateQuoteLines(lines).ok).toBe(false);
  });
});

describe("expiry", () => {
  const sent = new Date("2026-11-05T09:00:00+10:00");

  it("gives the owner four hours", () => {
    expect(QUOTE_EXPIRY_HOURS).toBe(4);
    expect(quoteExpiresAt(sent).toISOString()).toBe(new Date("2026-11-05T13:00:00+10:00").toISOString());
  });

  it("is not expired a minute before", () => {
    expect(isQuoteExpired("sent", sent, new Date("2026-11-05T12:59:00+10:00"))).toBe(false);
  });

  it("is expired on the hour and after", () => {
    expect(isQuoteExpired("sent", sent, new Date("2026-11-05T13:00:00+10:00"))).toBe(true);
    expect(isQuoteExpired("sent", sent, new Date("2026-11-05T18:00:00+10:00"))).toBe(true);
  });

  it("only expires something that was sent", () => {
    // A draft sitting around is not expired, it was never asked.
    expect(isQuoteExpired("draft", sent, new Date("2026-11-06T09:00:00+10:00"))).toBe(false);
    expect(isQuoteExpired("approved", sent, new Date("2026-11-06T09:00:00+10:00"))).toBe(false);
    expect(isQuoteExpired("sent", null, new Date("2026-11-06T09:00:00+10:00"))).toBe(false);
  });
});

describe("who said yes", () => {
  it("requires a note when staff approve on the owner's behalf", () => {
    expect(requiresApprovalNote("staff")).toBe(true);
    expect(requiresApprovalNote("client")).toBe(false);
  });

  it("says which of the two happened, because a dispute turns on it", () => {
    expect(describeQuoteStatus("approved", "client")).toBe("Approved by the owner");
    expect(describeQuoteStatus("approved", "staff")).toContain("recorded by staff");
    expect(describeQuoteStatus("approved", "staff")).not.toBe(describeQuoteStatus("approved", "client"));
  });

  it("has a line for every state", () => {
    for (const status of QUOTE_STATUSES) {
      expect(describeQuoteStatus(status), status).toBeTruthy();
    }
  });

  it("never calls an unpaid state approved", () => {
    expect(describeQuoteStatus("expired")).toContain("not charged");
    expect(describeQuoteStatus("declined")).toContain("Declined");
  });
});
