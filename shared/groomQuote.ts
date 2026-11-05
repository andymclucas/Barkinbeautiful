/**
 * Quoting extra work while the dog is on the table.
 *
 * Andy approved this on 05/11/2026, and chose this shape over two others
 * ("a price estimate for a prospective client", "a draft invoice"): the dog
 * is at the salon, the groomer finds matting or an ear that needs attention,
 * and wants the owner to agree to the extra charge BEFORE doing the work.
 *
 * ## What this is actually for
 *
 * It is a dispute-prevention tool, not a billing feature. The salon already
 * has somewhere to put an extra charge — the appointment price and the
 * invoice. What it has nowhere to put is the OWNER'S ANSWER: who was asked,
 * what figure they were shown, what they said and when. That record is the
 * whole point, so every rule here protects it.
 *
 * Three consequences, which are the reason this file exists rather than the
 * logic sitting in a router:
 *
 *  1. **The figure the owner saw cannot change.** Once a quote is sent, its
 *     price is frozen. Needing a different number means cancelling it and
 *     raising another, so there is never an approved quote whose amount
 *     nobody agreed to. `canEditQuote` is false for every state past draft.
 *
 *  2. **Silence is not consent.** A quote nobody answers expires, and an
 *     expired quote bills nothing. A groomer who cannot reach an owner does
 *     the original work; the salon does not get to assume a yes because it
 *     was convenient. `isBillable` is true for exactly one state.
 *
 *  3. **Who said yes is recorded, not assumed.** Owners ring back, or get
 *     caught at the door, so staff must be able to approve on their behalf
 *     — but that is a different fact from the owner tapping Approve on their
 *     phone, and a dispute turns on which one happened. Hence
 *     `QuoteApprovalSource` and the note requirement on a staff approval.
 *
 * ## Membership dogs are the case that matters most
 *
 * A membership groom carries no price — the weekly payment covers it — but
 * extras done on the day ARE invoiced (Andy, 07/10/2026). So an approved
 * quote on a membership dog is billable even though its groom is not, and
 * nothing here may be suppressed by membership coverage. That is the single
 * most likely way this feature gets quietly broken later, so it is written
 * down rather than left to be rediscovered.
 */

/** The states a quote can be in. */
export const QUOTE_STATUSES = [
  /** Built by the groomer, not yet shown to the owner. The only editable state. */
  "draft",
  /** The owner has been asked. The price is now frozen. */
  "sent",
  /** The owner agreed. The only state that bills. */
  "approved",
  /** The owner said no. The original work goes ahead unchanged. */
  "declined",
  /** Nobody answered in time. Bills nothing — see rule 2 above. */
  "expired",
  /** The groomer withdrew it, usually to raise a corrected one. "withdrawn"
   * rather than "cancelled", which already means two other things here —
   * appointments.status and the workflow state. */
  "withdrawn",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Who gave the answer. A dispute turns on this. */
export type QuoteApprovalSource =
  /** The owner, on their own phone, through the link they were sent. */
  | "client"
  /** Staff, on the owner's behalf — on the phone or at the door. */
  | "staff";

/**
 * The appointment workflow states in which extra work can be quoted.
 *
 * The dog has to be AT the salon and not yet gone home. `scheduled` is
 * excluded because nothing has been found yet and a price change before
 * arrival is a booking change, not a quote. `complete` is excluded
 * deliberately and firmly: quoting work after the dog has left is a
 * surprise charge, which is the thing this feature exists to prevent.
 *
 * `ready` IS included. The dog is finished but still here, and "we noticed
 * his nails, want them done before you arrive?" is a fair question that the
 * owner still has to answer.
 */
export const QUOTABLE_WORKFLOW_STATES: readonly string[] = [
  "checked_in",
  "waiting_for_bath",
  "bathing",
  "waiting_for_dry",
  "drying",
  "waiting_for_groom",
  "grooming",
  "ready",
];

export function canQuoteInWorkflowState(workflowState: string | null | undefined): boolean {
  return !!workflowState && QUOTABLE_WORKFLOW_STATES.includes(workflowState);
}

/** Where each state may go next. Everything absent is terminal. */
const TRANSITIONS: Readonly<Record<QuoteStatus, readonly QuoteStatus[]>> = {
  draft: ["sent", "withdrawn"],
  // A sent quote can still be answered by either side, time out, or be
  // withdrawn by the groomer who realises the price is wrong.
  sent: ["approved", "declined", "expired", "withdrawn"],
  approved: [],
  declined: [],
  expired: [],
  withdrawn: [],
};

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Only a draft may be edited. Rule 1 above. */
export function canEditQuote(status: QuoteStatus): boolean {
  return status === "draft";
}

/** Only an approved quote is charged. Rule 2 above. */
export function isQuoteBillable(status: QuoteStatus): boolean {
  return status === "approved";
}

/** Still waiting on the owner, so the groomer should not start the work. */
export function isQuoteAwaitingAnswer(status: QuoteStatus): boolean {
  return status === "sent";
}

export type QuoteLineInput = {
  description: string;
  /** Dollars, as a decimal string or a number. Never cents. */
  amount: string | number;
};

/**
 * Sum the lines in cents and return dollars to 2dp.
 *
 * In cents on purpose: 0.1 + 0.2 in floating point is 0.30000000000000004,
 * and a quote total that disagrees with the invoice by a cent is exactly the
 * kind of thing an owner notices and nobody can explain. Money crosses into
 * integer cents at the Stripe boundary anyway (CLAUDE.md §10) — this does it
 * one step earlier and comes back.
 */
export function quoteTotal(lines: readonly QuoteLineInput[]): string {
  let cents = 0;
  for (const line of lines) {
    const n = typeof line.amount === "number" ? line.amount : Number(line.amount);
    if (!Number.isFinite(n)) continue;
    cents += Math.round(n * 100);
  }
  return (cents / 100).toFixed(2);
}

/** The most a single quote may be, as a guard against a mis-typed figure. */
export const MAX_QUOTE_DOLLARS = 1000;

export type QuoteValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Is this a quote worth sending to an owner?
 *
 * Deliberately strict about the amount. A groomer typing 400 instead of 40
 * into a phone, mid-groom, with a wet dog, is a realistic Tuesday — and the
 * owner sees that figure before anybody notices.
 */
export function validateQuoteLines(lines: readonly QuoteLineInput[]): QuoteValidationResult {
  if (lines.length === 0) return { ok: false, reason: "A quote needs at least one line" };
  for (const line of lines) {
    if (!line.description.trim()) return { ok: false, reason: "Every line needs a description" };
    const n = typeof line.amount === "number" ? line.amount : Number(line.amount);
    if (!Number.isFinite(n)) return { ok: false, reason: `"${line.description}" has no price` };
    if (n <= 0) return { ok: false, reason: `"${line.description}" must cost more than nothing` };
  }
  const total = Number(quoteTotal(lines));
  if (total > MAX_QUOTE_DOLLARS) {
    return { ok: false, reason: `$${total.toFixed(2)} is over the $${MAX_QUOTE_DOLLARS} limit — check the figure` };
  }
  return { ok: true };
}

/**
 * How long an owner has to answer before the quote expires.
 *
 * Four hours, not a day: the dog is at the salon now and the groomer needs
 * an answer within this groom, not tomorrow. Expiry bills nothing, so a
 * short window is the safe direction to err in — the worst case is a
 * groomer re-asking, not a charge nobody agreed to.
 */
export const QUOTE_EXPIRY_HOURS = 4;

export function quoteExpiresAt(sentAt: Date): Date {
  return new Date(sentAt.getTime() + QUOTE_EXPIRY_HOURS * 3_600_000);
}

export function isQuoteExpired(status: QuoteStatus, sentAt: Date | null, now: Date): boolean {
  if (status !== "sent" || !sentAt) return false;
  return now.getTime() >= quoteExpiresAt(sentAt).getTime();
}

/**
 * A staff approval has to say how the owner was reached, because "staff
 * ticked the box" and "the owner agreed on the phone at 10:40" are
 * different claims and only one of them survives a dispute.
 */
export function requiresApprovalNote(source: QuoteApprovalSource): boolean {
  return source === "staff";
}

/** One line for the board and the audit trail. */
export function describeQuoteStatus(status: QuoteStatus, source?: QuoteApprovalSource | null): string {
  switch (status) {
    case "draft": return "Not sent yet";
    case "sent": return "Waiting on the owner";
    case "approved":
      return source === "staff" ? "Approved — owner agreed, recorded by staff" : "Approved by the owner";
    case "declined": return "Declined by the owner";
    case "expired": return "No answer — not charged";
    case "withdrawn": return "Withdrawn";
  }
}

/**
 * How an approved quote reads on the invoice.
 *
 * The owner has to recognise the charge they agreed to, weeks later, on a
 * bill that also lists the groom and the add-ons. An unexplained extra line
 * is the dispute this feature exists to prevent, arriving by a different
 * door.
 */
export const QUOTE_LINE_SUFFIX = "agreed on the day";

export function quoteLineDescription(petName: string | null | undefined, description: string): string {
  const pet = petName?.trim() || "Pet";
  return `${pet} — ${description} (${QUOTE_LINE_SUFFIX})`;
}
