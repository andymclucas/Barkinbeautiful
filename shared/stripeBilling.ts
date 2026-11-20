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
import { nextBrisbaneBusinessDay, businessDaysAfter, MAX_PAYMENT_RETRIES } from "./businessDays";

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
 * How hard to chase a failed payment, which depends on the cycle.
 *
 * Andy, 24/10/2026: "Set the retry thresholds for monthly billing."
 *
 * The weekly policy — two attempts a day apart, then suspend — is right
 * for weekly and wrong for monthly, for three reasons:
 *
 *  1. A weekly miss self-corrects. The next charge is seven days away
 *     whatever happens, so the retries are a convenience. A monthly
 *     miss has no next charge for a MONTH, so the retries are the only
 *     recovery path there is. Spending both of them inside 24 hours and
 *     then waiting four weeks is the wrong shape.
 *
 *  2. The amounts are not comparable. The average weekly charge on the
 *     live book is $26.80; monthly is $116.12. A $27 charge usually
 *     fails because the card is wrong. A $116 charge much more often
 *     fails because the money is not there yet, which is a timing
 *     problem that fixes itself.
 *
 *  3. Most Australians are paid fortnightly. Four attempts three
 *     business days apart spans about thirteen calendar days, so a
 *     client whose pay lands mid-cycle gets caught by a retry instead
 *     of by a suspension.
 *
 * Weekly is deliberately UNCHANGED. It works, and widening it would
 * leave a non-paying weekly client booking for a fortnight.
 *
 * None of this applies to a card that is simply wrong: `classifyFailure`
 * sends expired cards and bank refusals straight to suspension however
 * the membership bills, because no number of retries fixes those.
 */
export const RETRY_POLICY: Record<"weekly" | "monthly", {
  /** Attempts in total, counting the one that just failed. */
  maxAttempts: number;
  /** Business days between attempts. */
  businessDaysBetween: number;
}> = {
  weekly: { maxAttempts: MAX_PAYMENT_RETRIES, businessDaysBetween: 1 },
  monthly: { maxAttempts: 4, businessDaysBetween: 3 },
};

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
  /** Defaults to weekly, which is how every membership billed before 23/10/2026. */
  cycle: "weekly" | "monthly" = "weekly",
): RetryPlan {
  const policy = RETRY_POLICY[cycle] ?? RETRY_POLICY.weekly;
  if (action !== "retry") {
    return {
      retry: false,
      retryAt: null,
      suspend: true,
      reason: FAILURE_ACTION_MESSAGE[action],
    };
  }
  if (failedCount >= policy.maxAttempts) {
    return {
      retry: false,
      retryAt: null,
      suspend: true,
      reason: `Suspended after ${failedCount} failed payments.`,
    };
  }
  return {
    retry: true,
    retryAt: businessDaysAfter(now, policy.businessDaysBetween),
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
 * The Stripe cadence a membership should bill at, derived from the weeks
 * stored on the membership itself.
 *
 * Returns null rather than guessing. Every one of the salon's 154 active
 * memberships is weekly today, so the staff UI used to pass "weekly" as a
 * literal — correct now, silently wrong the first time someone sells a
 * fortnightly package. Four weeks is deliberately NOT treated as monthly:
 * 4-weekly bills 13 times a year and monthly bills 12, and picking one for
 * the user would overcharge or undercharge them. An unmapped cycle disables
 * the button and asks a human instead.
 */
export function billingCycleFromWeeks(weeks: number | null | undefined): BillingCycle | null {
  if (weeks === 1) return "weekly";
  if (weeks === 2) return "fortnightly";
  return null;
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

/**
 * "Visa ···· 4242 · exp 08/28", or null when no payment method is saved.
 *
 * A saved payment method does NOT always carry card details: a wallet or a
 * Link payment method arrives with `card` empty, so brand and last4 are
 * null while the method itself charges perfectly well. Returning null for
 * those made the client page say "No card saved" about a client who had
 * just saved one — which sends staff to ask them again, and suggests
 * membership billing cannot start when it can. Say what is true instead.
 */
export function describeCard(card: {
  stripeCardBrand?: string | null;
  stripeCardLast4?: string | null;
  stripeCardExpMonth?: number | null;
  stripeCardExpYear?: number | null;
  stripeDefaultPaymentMethodId?: string | null;
}): string | null {
  if (!card.stripeCardLast4) {
    if (card.stripeCardBrand) {
      const named = card.stripeCardBrand.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return `${named} saved · card details unavailable`;
    }
    return card.stripeDefaultPaymentMethodId ? "Payment method saved · card details unavailable" : null;
  }
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

/**
 * A retry that staff press is not a strike.
 *
 * Andy, 20/11/2026: "Only automatic attempts count towards suspension."
 *
 * The history: on 19/11/2026 a card declined at 9:16 am (strike one),
 * Lauren pressed Retry at 9:41 am, it declined again and the membership
 * was suspended. "It suspended his membership? But i only just put in his
 * details." Pressing the button is somebody at the counter trying to
 * HELP; it should never be what locks a client out of booking.
 *
 * A retry of an open invoice is reported by Stripe itself
 * (invoice.payment_failed), and that event looks the same whoever caused
 * it. So the button stamps the invoice with the time just before it
 * tries, and the webhook treats a failure that lands within a few minutes
 * of that stamp as the button's. The stamp is a time, not a flag, so it
 * goes stale on its own: Stripe's next automatic attempt on the same
 * invoice, hours or days later, counts as it always did.
 */
export const STAFF_RETRY_METADATA_KEY = "groomigo_staff_retry_at";
export const STAFF_RETRY_WINDOW_SECONDS = 180;

/** `metadata` is the failed invoice's; `eventCreated` is the Stripe event's `created`, in seconds. */
export function isStaffPressedRetry(
  metadata: Record<string, string | null | undefined> | null | undefined,
  eventCreated: number | null | undefined,
): boolean {
  const stamped = Number(metadata?.[STAFF_RETRY_METADATA_KEY]);
  const at = Number(eventCreated);
  if (!Number.isFinite(stamped) || stamped <= 0 || !Number.isFinite(at) || at <= 0) return false;
  const gap = at - stamped;
  // A few seconds of grace the other way: the two clocks are not the same clock.
  return gap >= -10 && gap <= STAFF_RETRY_WINDOW_SECONDS;
}

/** What the failed row says when the attempt was the button's. */
export const STAFF_RETRY_FAILURE_NOTE = "Declined on a retry pressed by staff. Not counted towards suspension.";

/**
 * Why a membership payment failed, in the words Stripe's own dashboard uses.
 *
 * Andy, 19/11/2026, looking at five rows that all said "Card declined":
 * "Why are these failing?" Every one was insufficient funds, and Groomigo
 * could not say so: the webhook looks for the decline code on the invoice's
 * `last_finalization_error`, which Stripe does not fill for a declined
 * payment. "Pull the data from Stripe for the real reason."
 *
 * So the reason is read from the payment itself (its last error) and put
 * through this. Known codes get plain words; anything else falls back to
 * the sentence Stripe wrote, which is already meant for a person. Null when
 * Stripe gave nothing, so the caller keeps whatever it had.
 *
 * This is for DISPLAY. It deliberately does not feed `classifyFailure`:
 * that decides whether a membership is suspended on the spot, and changing
 * what it sees would change who gets suspended.
 */
export type StripeFailureDetail = {
  /** e.g. "card_declined", "payment_method_provider_decline". */
  code?: string | null;
  /** e.g. "insufficient_funds", "expired_card". */
  declineCode?: string | null;
  /** Stripe's own sentence. */
  message?: string | null;
};

const FAILURE_WORDS: Record<string, string> = {
  insufficient_funds: "Insufficient funds",
  expired_card: "The card has expired",
  incorrect_cvc: "The card's security code was wrong",
  lost_card: "The card was reported lost",
  stolen_card: "The card was reported stolen",
  pickup_card: "The bank has blocked this card",
  restricted_card: "The bank has restricted this card",
  do_not_honor: "The bank refused the payment without a reason",
  generic_decline: "The bank refused the payment without a reason",
  card_velocity_exceeded: "The card has hit its spending limit",
  withdrawal_count_limit_exceeded: "The card has hit its spending limit",
  authentication_required: "The bank wants the client to approve the payment",
  transaction_not_allowed: "The bank does not allow this kind of payment on the card",
};

export function describeMembershipFailure(detail: StripeFailureDetail | null | undefined): string | null {
  if (!detail) return null;
  for (const raw of [detail.declineCode, detail.code]) {
    const code = (raw ?? "").trim().toLowerCase();
    if (code && FAILURE_WORDS[code]) return FAILURE_WORDS[code];
  }
  const message = (detail.message ?? "").trim();
  if (/insufficient funds/i.test(message)) return FAILURE_WORDS.insufficient_funds;
  if (message) return message.replace(/\.$/, "");
  return null;
}

/**
 * What staff are told before they press "Retry payment".
 *
 * Until 20/11/2026 a declined retry was another failed payment, and this
 * warned that a second "no" would suspend a weekly membership. Andy,
 * 20/11/2026: "Only automatic attempts count towards suspension." So the
 * button can no longer make anything worse, and this says so, because
 * staff who were warned off it last week need to know it is safe now.
 */
export function retryWarning(failedCount: number): string {
  if (failedCount >= 2) {
    return "This membership is already suspended. If the payment goes through it becomes active again; if not, nothing changes.";
  }
  return "If it is declined, nothing changes: a retry you press does not count towards suspension. Only the automatic attempts do.";
}

/**
 * Which Stripe invoice a "retry" should pay, if any.
 *
 * The retry used to look only at the NEWEST failed row. A failure typed in
 * by hand, or a failed direct charge, has no invoice on it, so the newest
 * row could hide an invoice that was still open in Stripe. The retry would
 * then charge the card directly, and when Stripe's own scheduled retry paid
 * the open invoice later the client had paid twice.
 *
 * So: the newest failed row that HAS an invoice, unless that invoice has
 * since been paid. A paid invoice is finished business; "paying" it again
 * comes back as a success with no money moved, which would mark a
 * membership active on nothing.
 *
 * `failedRows` newest first. Null means there is no open invoice to pay
 * and a direct charge is the right thing.
 */
export function invoiceToRetry(
  failedRows: ReadonlyArray<{ stripeInvoiceId?: string | null }>,
  paidInvoiceIds: ReadonlyArray<string | null | undefined>,
): string | null {
  const paid = new Set(paidInvoiceIds.filter((id): id is string => Boolean(id)));
  for (const row of failedRows) {
    const invoiceId = row.stripeInvoiceId?.trim();
    if (!invoiceId) continue;
    return paid.has(invoiceId) ? null : invoiceId;
  }
  return null;
}
