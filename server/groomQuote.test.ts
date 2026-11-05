import { describe, expect, it } from "vitest";
import {
  QUOTE_STATUSES, QUOTABLE_WORKFLOW_STATES, MAX_QUOTE_DOLLARS, QUOTE_EXPIRY_HOURS,
  canQuoteInWorkflowState, canTransitionQuote, canEditQuote, isQuoteBillable,
  isQuoteAwaitingAnswer, quoteTotal, validateQuoteLines, quoteExpiresAt,
  isQuoteExpired, requiresApprovalNote, describeQuoteStatus,
  quoteRequestSms, quoteUrl, quoteLineDescription, QUOTE_LINE_SUFFIX,
  type QuoteStatus,
} from "../shared/groomQuote";
import { calculateSmsCost } from "../shared/smsSegments";

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
  it("lets a draft be sent, answered by a person, or withdrawn", () => {
    expect(canTransitionQuote("draft", "sent")).toBe(true);
    expect(canTransitionQuote("draft", "withdrawn")).toBe(true);
    // Changed 06/11/2026. This used to be false, on the reasoning that an
    // approved quote must be one the owner was SHOWN. The reasoning was
    // right and the rule was wrong: `send` refuses a client with no mobile
    // or who replied STOP, and `send` was the only way out of draft — so
    // for exactly those clients the app told the groomer to ring them and
    // record the answer, and then had nowhere to record it.
    //
    // The owner is still shown the figure; a person reads it to them. That
    // is what approvalSource "staff" and the required note say, and it is
    // a different claim from them tapping the link, which is the point.
    expect(canTransitionQuote("draft", "approved")).toBe(true);
    expect(canTransitionQuote("draft", "declined")).toBe(true);
    // Still not expiry: nothing was sent, so there is no clock to run out.
    expect(canTransitionQuote("draft", "expired")).toBe(false);
  });

  it("still refuses to approve a draft through the TOKEN path", () => {
    // The relaxation above is for a staff-recorded answer only. The owner's
    // own link is minted by `send`, so a draft has no token to answer with
    // — answerByToken looks the quote up BY token hash and a draft has
    // none. Silence is still not consent.
    expect(canTransitionQuote("draft", "sent")).toBe(true);
  });

  it("lets a sent quote be answered, time out, or be withdrawn", () => {
    for (const to of ["approved", "declined", "expired", "withdrawn"] as QuoteStatus[]) {
      expect(canTransitionQuote("sent", to), to).toBe(true);
    }
  });

  it("makes declined, expired and withdrawn terminal", () => {
    for (const from of ["declined", "expired", "withdrawn"] as QuoteStatus[]) {
      for (const to of QUOTE_STATUSES) {
        expect(canTransitionQuote(from, to), `${from} -> ${to}`).toBe(false);
      }
    }
  });

  it("lets an approved quote be withdrawn, and nothing else", () => {
    /*
     * Added 06/11/2026. An approval used to be permanent, which sounds
     * like integrity and was a trap: an owner mis-tapping Yes, or staff
     * recording "they said yes" against the wrong dog, could only be
     * undone by editing the database, because nothing in the app edits an
     * invoice line afterwards.
     *
     * The caller checks nothing has billed it yet — this file cannot see
     * an invoice. Withdrawing keeps decided_at and approval_source, so the
     * original answer stays on the record rather than being erased.
     */
    expect(canTransitionQuote("approved", "withdrawn")).toBe(true);
    for (const to of ["draft", "sent", "approved", "declined", "expired"] as QuoteStatus[]) {
      expect(canTransitionQuote("approved", to), `approved -> ${to}`).toBe(false);
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

describe("the text the owner gets", () => {
  const realistic = {
    salonName: "Barkin Beautiful",
    petName: "Link",
    total: "60.00",
    url: quoteUrl("https://client.barkinbeautiful.com.au", "a".repeat(32)),
  };

  it("fits one GSM-7 segment for the salon's real values", () => {
    // Not a style preference. One non-GSM character — an em-dash, a curly
    // apostrophe, a pound sign — forces the whole message to UCS-2, which
    // cuts a segment from 160 characters to 70 and doubles the bill on
    // every quote the salon ever sends. The URL alone is about 70
    // characters, so there is no room to absorb it.
    const cost = calculateSmsCost(quoteRequestSms(realistic));
    expect(cost.encoding).toBe("GSM-7");
    expect(cost.forcedUnicode).toBe(false);
    expect(cost.segments).toBe(1);
  });

  it("puts the figure in the message, not only behind the link", () => {
    // An owner should be able to tell from the notification whether this
    // needs dealing with right now, without tapping anything.
    expect(quoteRequestSms(realistic)).toContain("$60.00");
    expect(quoteRequestSms(realistic)).toContain("Link");
  });

  it("builds the link on whichever host it is handed", () => {
    // It must follow VITE_PORTAL_URL rather than hardcoding a host: this
    // link is texted to a client, and client links moved to their own
    // domain on 06/11/2026.
    expect(quoteUrl("https://client.barkinbeautiful.com.au/", "abc")).toBe(
      "https://client.barkinbeautiful.com.au/quote/abc",
    );
  });
});

describe("expiry is judged against the stored deadline", () => {
  const sentAt = new Date("2026-11-06T00:00:00Z");

  it("uses expires_at when it is there, not the current constant", () => {
    /*
     * The whole reason expires_at is a column. Recomputing from
     * QUOTE_EXPIRY_HOURS means changing that constant moves the deadline
     * on every quote already in flight — so an owner could be shown one
     * time on their page and refused at another. The schema and the
     * migration both say the stored value wins; this is what makes that
     * true.
     */
    const stored = new Date(sentAt.getTime() + 8 * 3_600_000);
    // Past the four-hour default, nowhere near the stored eight.
    const justAfterDefault = new Date(sentAt.getTime() + 5 * 3_600_000);
    expect(isQuoteExpired("sent", sentAt, justAfterDefault, stored)).toBe(false);
    expect(isQuoteExpired("sent", sentAt, new Date(stored.getTime() + 1), stored)).toBe(true);
  });

  it("falls back to the constant for a quote with no stored deadline", () => {
    const past = new Date(sentAt.getTime() + (QUOTE_EXPIRY_HOURS + 1) * 3_600_000);
    expect(isQuoteExpired("sent", sentAt, past, null)).toBe(true);
    expect(isQuoteExpired("sent", sentAt, sentAt, null)).toBe(false);
  });

  it("only ever expires a quote that was actually sent", () => {
    const past = new Date(sentAt.getTime() + 99 * 3_600_000);
    for (const status of ["draft", "approved", "declined", "expired", "withdrawn"] as QuoteStatus[]) {
      expect(isQuoteExpired(status, sentAt, past, null), status).toBe(false);
    }
  });
});

describe("the invoice line always fits the column", () => {
  it("trims a long description rather than failing the insert", () => {
    /*
     * invoice_lines.description is VARCHAR(255). The failure this
     * prevents is nasty: it happens after the dog is complete and after
     * the invoice header has been written with a total, so the bill ends
     * up with a figure and no lines at all.
     */
    const line = quoteLineDescription("Bartholomew", "De-matting ".repeat(40));
    expect(line.length).toBeLessThanOrEqual(255);
    expect(line.endsWith(`(${QUOTE_LINE_SUFFIX})`)).toBe(true);
    expect(line.startsWith("Bartholomew — ")).toBe(true);
    // Visibly trimmed, not silently truncated mid-word with no sign.
    expect(line).toContain("…");
  });

  it("leaves a normal line exactly as the groomer typed it", () => {
    expect(quoteLineDescription("Link", "De-matting")).toBe("Link — De-matting (agreed on the day)");
  });
});
