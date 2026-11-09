/**
 * Split payments: one booking, several payment transactions.
 *
 * The salon needs this in three shapes, and they are the same arithmetic:
 *
 *  - Part cash, part card. "$100 on the card and the rest in cash" is one
 *    grooming ticket and two transactions.
 *  - One dog each. A two-dog booking is two `appointments` rows sharing a
 *    `sessionId`, each already carrying its own price, and the two owners of a
 *    separated household want to pay for their own dog.
 *  - Deposit now, balance at pickup.
 *
 * So a payment is a row against ONE appointment, and an appointment may have
 * many. Money paid is the sum of the rows; the balance is the price minus that
 * sum; `appointments.paymentStatus` is derived, never typed in by hand.
 *
 * Everything here works in integer cents internally. Splitting a bill is the
 * classic place floating point shows up in front of a customer: $100 across
 * three dogs is 33.33 three times, which is $99.99, and the salon is a cent
 * short with no idea why. `splitEvenly` distributes cents, so the parts always
 * add back to the total exactly.
 */

export const PAYMENT_METHODS = [
  "cash",
  "eftpos",
  "card",
  "stripe",
  "bank_transfer",
  "store_credit",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * What staff see in the "Take payment" dropdown.
 *
 * All but one of these RECORD a payment that has already happened
 * somewhere else: `payments.record` validates the amount and inserts a
 * row, and `store_credit` additionally draws the balance down.
 *
 * ## Stripe is the exception, since 09/11/2026
 *
 * Andy: "Make Stripe in the dropdown actually charge the card on file."
 *
 * It used to be the opposite, and this comment used to say so at
 * length: a bare "Stripe" read like a button that would charge the card
 * and picking it did the reverse — marked the booking paid and took
 * nothing. The honest fix then was the label. The honest fix now is to
 * make the word mean what everybody reads it as.
 *
 * Picking it routes to `payments.chargeCardOnFile` instead of
 * `payments.record`, behind the same two-step confirm the card box
 * uses, because the person choosing it this week has spent months
 * choosing it to mean "write this down".
 *
 * ## What that costs
 *
 * There is no longer a way to hand-key a Stripe payment that happened
 * some other way. The common case never needed one — a client who pays
 * the Pay Now link has it posted by the webhook — but if a payment ever
 * arrives through Stripe by a route the webhook does not see, it now
 * has to go in as "Other" with a note.
 *
 * The stored value is still `stripe` either way, and that is right: it
 * means money moved through Stripe, which is true of a charge and of a
 * webhook posting alike.
 */
/**
 * Whether picking this method MOVES money, rather than writing down
 * money that moved somewhere else.
 *
 * One function because the panel asks twice — once to route the press
 * away from `payments.record`, and once to label the button "Charge
 * card" instead of "Take payment". Two inline `=== "stripe"` checks is
 * precisely how a button comes to promise one thing and do the other,
 * which is the bug this whole change replaced.
 *
 * If a second method ever starts charging, it goes here, and the
 * confirm and the label follow for free.
 */
export function methodChargesCard(method: PaymentMethod): boolean {
  return method === "stripe";
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  eftpos: "EFTPOS",
  card: "Card (manual)",
  stripe: "Stripe — charge the card on file",
  bank_transfer: "Bank transfer",
  store_credit: "Store credit",
  other: "Other",
};

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface PaymentLine {
  /** Decimal string out of MySQL, or a number from anywhere else. */
  amount: string | number | null | undefined;
}

/** Dollars to whole cents. Junk becomes 0 rather than NaN. */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Whole cents back to dollars, exact to the cent. */
export const fromCents = (cents: number): number => Math.round(cents) / 100;

/** What has actually been taken. Refund rows are negative and reduce it. */
export function sumPaid(lines: readonly PaymentLine[]): number {
  return fromCents(lines.reduce((total, line) => total + toCents(line.amount), 0));
}

export interface PaymentSummary {
  /** The appointment price, or null when no figure was ever recorded. */
  total: number | null;
  paid: number;
  /** Null when the total is unknown - "owing" is meaningless without a price. */
  outstanding: number | null;
  /** Null when the total is unknown, so the column is left alone. */
  status: PaymentStatus | null;
  /** More has been taken than the price. Worth saying out loud in the UI. */
  overpaid: boolean;
}

export function summarisePayments(
  total: string | number | null | undefined,
  lines: readonly PaymentLine[],
): PaymentSummary {
  const paidCents = lines.reduce((sum, line) => sum + toCents(line.amount), 0);
  const hasTotal = total !== null && total !== undefined && String(total).trim() !== "";
  if (!hasTotal) {
    return { total: null, paid: fromCents(paidCents), outstanding: null, status: null, overpaid: false };
  }
  const totalCents = toCents(total);
  const outstandingCents = totalCents - paidCents;
  return {
    total: fromCents(totalCents),
    paid: fromCents(paidCents),
    outstanding: fromCents(outstandingCents),
    // Nothing owing is settled, including a genuinely free groom. Anything
    // taken but not enough is partial. Nothing taken is unpaid.
    status: outstandingCents <= 0 ? "paid" : paidCents <= 0 ? "unpaid" : "partial",
    overpaid: outstandingCents < 0,
  };
}

export function derivePaymentStatus(
  total: string | number | null | undefined,
  lines: readonly PaymentLine[],
): PaymentStatus | null {
  return summarisePayments(total, lines).status;
}

/**
 * `total` divided `ways` ways, in dollars, adding back to exactly `total`.
 *
 * The remainder goes on the FIRST part: whoever pays first covers the odd cent.
 * That is arbitrary but it has to be somebody, and doing it consistently means
 * the number the receptionist reads out first is the larger one.
 */
export function splitEvenly(total: string | number | null | undefined, ways: number): number[] {
  const parts = Math.floor(ways);
  if (!Number.isFinite(parts) || parts < 1) return [];
  const totalCents = toCents(total);
  const base = Math.trunc(totalCents / parts);
  let remainder = totalCents - base * parts;
  // `remainder` carries the sign of the total, so a negative split (an evenly
  // divided refund) distributes its odd cents the same way.
  const step = remainder >= 0 ? 1 : -1;
  return Array.from({ length: parts }, () => {
    let cents = base;
    if (remainder !== 0) {
      cents += step;
      remainder -= step;
    }
    return fromCents(cents);
  });
}

export interface AmountValidation {
  ok: boolean;
  /** Dollars, cent-rounded, only when ok. */
  amount: number;
  error?: string;
}

const money = (dollars: number) => `$${dollars.toFixed(2)}`;

/**
 * Check an amount typed at the counter before it becomes a payment row.
 *
 * Rejecting an overpayment matters more than it sounds: the common cause is a
 * missed decimal point, and a row of $29000 against a $290 groom quietly makes
 * every revenue figure in the app wrong. When the appointment has no price at
 * all there is nothing to check against, so anything goes.
 */
export function validatePaymentAmount(
  input: string | number | null | undefined,
  summary: Pick<PaymentSummary, "outstanding" | "paid">,
): AmountValidation {
  const raw = typeof input === "number" ? String(input) : (input ?? "").toString().trim();
  if (raw === "") return { ok: false, amount: 0, error: "Enter an amount" };
  const cents = toCents(raw);
  const parsed = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) return { ok: false, amount: 0, error: "That is not an amount" };
  if (cents === 0) return { ok: false, amount: 0, error: "Enter an amount other than zero" };

  if (cents < 0) {
    // A refund cannot give back more than was taken.
    const paidCents = Math.round(summary.paid * 100);
    if (-cents > paidCents) {
      return { ok: false, amount: 0, error: `Only ${money(summary.paid)} has been taken` };
    }
    return { ok: true, amount: fromCents(cents) };
  }

  if (summary.outstanding !== null) {
    const outstandingCents = Math.round(summary.outstanding * 100);
    if (outstandingCents <= 0) {
      return { ok: false, amount: 0, error: "This booking is already paid in full" };
    }
    if (cents > outstandingCents) {
      return { ok: false, amount: 0, error: `That is more than the ${money(summary.outstanding)} outstanding` };
    }
  }
  return { ok: true, amount: fromCents(cents) };
}
