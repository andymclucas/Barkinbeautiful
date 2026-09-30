/**
 * The decisions around Stripe billing, kept out of the API calls.
 *
 * Everything here is pure so it can be tested without a Stripe key, which
 * matters because the parts that are easy to get wrong are all judgement
 * rather than plumbing: whether a decline is worth retrying, when the retry
 * should happen, and when to stop and ask a human.
 *
 * Context: memberships bill weekly. Before this, `paymentRetryHandler` never
 * attempted a charge at all - it read the memberships due for retry and
 * escalated each one straight to another strike, so a client with a
 * momentarily declined card was suspended two business days later without
 * Stripe ever being asked a second time.
 */
import { nextBrisbaneBusinessDay, MAX_PAYMENT_RETRIES } from "./businessDays";

/** Dollars (decimal string or number) to the integer cents Stripe wants. */
export function toStripeCents(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "number" ? amount : Number(String(amount).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const fromStripeCents = (cents: number | null | undefined): number =>
  Math.round(Number(cents ?? 0)) / 100;

/**
 * What to do about a declined charge.
 *
 *  retry        - transient. The bank may well approve the same card tomorrow.
 *  new_card     - the card itself is the problem. Retrying cannot help, so
 *                 stop burning attempts and ask the client to re-enter it.
 *  contact_bank - the bank is refusing and only the client can resolve it.
 *
 * Stripe's decline codes are the reliable signal; `card_declined` with no
 * further detail is the ambiguous one and is treated as retryable, because
 * "insufficient funds this morning" is the single most common cause in a
 * weekly billing cycle.
 */
export type FailureAction = "retry" | "new_card" | "contact_bank";

const NEW_CARD_CODES = new Set([
  "expired_card",
  "incorrect_number",
  "invalid_number",
  "invalid_expiry_month",
  "invalid_expiry_year",
  "invalid_cvc",
  "incorrect_cvc",
  "card_not_supported",
  "currency_not_supported",
  "authentication_required",
  "payment_method_not_available",
]);

const CONTACT_BANK_CODES = new Set([
  "call_issuer",
  "do_not_honor",
  "fraudulent",
  "lost_card",
  "stolen_card",
  "pickup_card",
  "restricted_card",
  "security_violation",
  "transaction_not_allowed",
]);

export function classifyFailure(declineCode: string | null | undefined): FailureAction {
  const code = (declineCode ?? "").trim().toLowerCase();
  if (NEW_CARD_CODES.has(code)) return "new_card";
  if (CONTACT_BANK_CODES.has(code)) return "contact_bank";
  return "retry";
}

/** Plain English for the alert the salon sees, and the email the client gets. */
export const FAILURE_ACTION_MESSAGE: Record<FailureAction, string> = {
  retry: "Card declined. Will try again on the next business day.",
  new_card: "The card on file cannot be used. Ask the client for new card details.",
  contact_bank: "The bank refused the payment. The client needs to contact them.",
};

export interface RetryPlan {
  /** Whether another automatic attempt should be made at all. */
  retry: boolean;
  /** When, in the salon's timezone, or null when there is no next attempt. */
  retryAt: Date | null;
  /** Stop billing and stop the client booking until a human intervenes. */
  suspend: boolean;
  reason: string;
}

/**
 * What happens after an attempt fails.
 *
 * `failedCount` is the count INCLUDING the attempt that just failed, so the
 * first failure arrives as 1. Two strikes and the membership is suspended,
 * which matches what the handler has always done and is now in one place
 * rather than as a bare `>= 2` in the middle of a scheduled job.
 */
export function planAfterFailure(
  failedCount: number,
  action: FailureAction,
  now: Date,
): RetryPlan {
  if (action !== "retry") {
    return {
      retry: false,
      retryAt: null,
      suspend: true,
      reason: FAILURE_ACTION_MESSAGE[action],
    };
  }
  if (failedCount >= MAX_PAYMENT_RETRIES) {
    return {
      retry: false,
      retryAt: null,
      suspend: true,
      reason: `Suspended after ${failedCount} failed payments.`,
    };
  }
  return {
    retry: true,
    retryAt: nextBrisbaneBusinessDay(now),
    suspend: false,
    reason: FAILURE_ACTION_MESSAGE.retry,
  };
}

/** Weekly is the only cycle the salon sells; the others are here for clarity. */
export type BillingCycle = "weekly" | "fortnightly" | "monthly";

export function stripeRecurring(cycle: BillingCycle): { interval: "week" | "month"; interval_count: number } {
  switch (cycle) {
    case "fortnightly":
      return { interval: "week", interval_count: 2 };
    case "monthly":
      return { interval: "month", interval_count: 1 };
    case "weekly":
    default:
      return { interval: "week", interval_count: 1 };
  }
}

/**
 * A card is usable for an off-session charge only if we have both the
 * customer and the payment method. Stripe rejects a charge with one and not
 * the other, with an error the salon cannot act on.
 */
export function canChargeOffSession(card: {
  stripeCustomerId?: string | null;
  stripeDefaultPaymentMethodId?: string | null;
}): boolean {
  return Boolean(card.stripeCustomerId && card.stripeDefaultPaymentMethodId);
}

/** "Visa ···· 4242 · exp 08/28", or null when no card is saved. */
export function describeCard(card: {
  stripeCardBrand?: string | null;
  stripeCardLast4?: string | null;
  stripeCardExpMonth?: number | null;
  stripeCardExpYear?: number | null;
}): string | null {
  if (!card.stripeCardLast4) return null;
  const brand = (card.stripeCardBrand ?? "Card").replace(/\b\w/g, (c) => c.toUpperCase());
  const expiry =
    card.stripeCardExpMonth && card.stripeCardExpYear
      ? ` · exp ${String(card.stripeCardExpMonth).padStart(2, "0")}/${String(card.stripeCardExpYear).slice(-2)}`
      : "";
  return `${brand} ···· ${card.stripeCardLast4}${expiry}`;
}

/**
 * Has the saved card already expired, as at `now`?
 *
 * A card expires at the END of its expiry month. Checking it before a weekly
 * charge turns a decline the client never hears about into a prompt at the
 * counter while they are standing there.
 */
export function isCardExpired(
  card: { stripeCardExpMonth?: number | null; stripeCardExpYear?: number | null },
  now: Date,
): boolean {
  if (!card.stripeCardExpMonth || !card.stripeCardExpYear) return false;
  const endOfExpiryMonth = new Date(Date.UTC(card.stripeCardExpYear, card.stripeCardExpMonth, 1));
  return now.getTime() >= endOfExpiryMonth.getTime();
}

/**
 * Stripe's test keys and live keys are indistinguishable at a glance in a
 * Render environment panel, and charging a real client from a test key (or
 * the reverse) is the kind of mistake nobody notices for a week.
 */
export function describeStripeKey(key: string | null | undefined): {
  configured: boolean;
  mode: "test" | "live" | "unknown";
  placeholder: boolean;
} {
  const value = (key ?? "").trim();
  if (!value) return { configured: false, mode: "unknown", placeholder: false };
  const placeholder = /placeholder|your_|xxx|changeme|replace/i.test(value) || value.length < 30;
  const mode = value.startsWith("sk_live") || value.startsWith("rk_live")
    ? "live"
    : value.startsWith("sk_test") || value.startsWith("rk_test")
      ? "test"
      : "unknown";
  return { configured: !placeholder, mode, placeholder };
}
