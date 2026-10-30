/**
 * Spending store credit, so the balance and the till agree.
 *
 * There are two records of the same money and until 30/10/2026 they
 * never spoke:
 *
 *   `store_credit_transactions`  the client's BALANCE
 *   `appointment_payments`       what was taken at the COUNTER
 *
 * Taking $90 from a client's credit wrote a payment row and left the
 * balance untouched, so the same credit could be spent again, and
 * again. In production that had already happened: Mike Graham's ledger
 * read $840 with $40 of it spent, and Irene Fang had $180 taken against
 * a balance of nothing at all.
 *
 * The rule now is simply that the two move together. A store-credit
 * payment implies a ledger debit of the same amount; removing that
 * payment implies putting it back. This module decides what that entry
 * looks like, so the decision is testable and lives in one place rather
 * than being spelled out at each call site.
 */

/** The methods that draw on the balance. Anything else is real money. */
export const SPENDS_STORE_CREDIT = "store_credit" as const;

export type StoreCreditEntry = {
  /** Negative when credit is being used, positive when it is given back. */
  amount: string;
  type: "appointment_deduction" | "refund";
  note: string;
};

export function spendsStoreCredit(method: string): boolean {
  return method === SPENDS_STORE_CREDIT;
}

/**
 * The ledger entry a counter payment implies, or null when the payment
 * is ordinary money and the balance is none of its business.
 *
 * A NEGATIVE payment is a refund — the salon giving money back — so the
 * credit returns to the balance and the entry is positive. The two
 * signs are deliberately opposite and are the thing most likely to be
 * got backwards, which is why they are pinned by test.
 */
export function creditEntryForPayment(input: {
  method: string;
  /** Dollars, as recorded against the appointment. */
  amount: number;
  appointmentId: number;
}): StoreCreditEntry | null {
  if (!spendsStoreCredit(input.method)) return null;
  if (!Number.isFinite(input.amount) || input.amount === 0) return null;

  const refund = input.amount < 0;
  return {
    amount: (-input.amount).toFixed(2),
    type: refund ? "refund" : "appointment_deduction",
    note: refund
      ? `Store credit returned when a payment on appointment ${input.appointmentId} was reversed`
      : `Store credit used against appointment ${input.appointmentId}`,
  };
}

/** The entry that undoes `creditEntryForPayment`, for a removed payment. */
export function reversalEntryForPayment(input: {
  method: string;
  amount: number;
  appointmentId: number;
}): StoreCreditEntry | null {
  const original = creditEntryForPayment(input);
  if (!original) return null;
  return {
    amount: (-Number(original.amount)).toFixed(2),
    type: Number(original.amount) < 0 ? "refund" : "appointment_deduction",
    note: `Reversed: ${original.note}`,
  };
}

export type CreditShortfall = {
  balance: number;
  spending: number;
  /** What the balance becomes. Negative means more was spent than existed. */
  remaining: number;
  short: boolean;
  /** Plain words for the person at the counter, or null when it covers. */
  message: string | null;
};

/**
 * Whether the balance covers it — reported, NOT enforced.
 *
 * Refusing would be correct bookkeeping and wrong for this salon right
 * now: credit is still being carried across from MoeGo by hand, so a
 * client can genuinely hold credit that Groomigo has not heard of yet.
 * Irene Fang's $180 is exactly that shape. Blocking it would stop the
 * counter; recording it and saying the balance has gone negative tells
 * the truth and leaves the salon able to work.
 *
 * A negative balance is therefore a real, visible state meaning "credit
 * was spent that we had not recorded" — not a bug to be clamped away.
 */
export function describeCreditShortfall(
  balance: number,
  spending: number,
): CreditShortfall {
  const bal = Number.isFinite(balance) ? balance : 0;
  const spend = Number.isFinite(spending) ? spending : 0;
  const remaining = Math.round((bal - spend) * 100) / 100;
  const short = remaining < -0.005;
  return {
    balance: bal,
    spending: spend,
    remaining,
    short,
    message: short
      ? `This client has $${bal.toFixed(2)} of store credit and $${spend.toFixed(2)} is being used. Their balance will go to $${remaining.toFixed(2)} — check whether credit is still to be carried across.`
      : null,
  };
}
