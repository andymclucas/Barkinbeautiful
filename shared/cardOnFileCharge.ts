/**
 * Charging the card a client already has on file, from the payment panel.
 *
 * Andy, 02/11/2026: "staff can hit the button if a card is already on
 * file and it will deduct the amount through Stripe. Also, if they
 * don't — take them to the secure Stripe card entry screen where they
 * can input the details and it saves it for future use."
 *
 * Two states, one button. Everything here is pure so the decision can
 * be tested without Stripe and without a database.
 *
 * Note what this does NOT do: take a card number. The no-card branch
 * sends the client to Stripe's own hosted page, which is the only
 * reason this business is out of PCI scope. A "type the card in here"
 * field would put card data through Groomigo's server and change that
 * overnight.
 */

export type CardOnFile = {
  stripeCustomerId?: string | null;
  stripeDefaultPaymentMethodId?: string | null;
  stripeCardExpMonth?: number | null;
  stripeCardExpYear?: number | null;
};

export type CardChargeState =
  | "chargeable"
  | "needs_card"
  | "expired"
  | "nothing_owing"
  | "stripe_off";

export type CardChargeAvailability = {
  state: CardChargeState;
  /** The button's words. */
  action: string;
  /** Why, under the button, when there is something to explain. */
  hint: string | null;
};

/**
 * Whether a failure is the client's card saying no, or our own plumbing.
 *
 * A decline is reported to the operator and the booking stays unpaid.
 * A concurrency signal is neither — nobody should be asked for another
 * card because two requests raced.
 */
export function isDecline(declineCode: string | null): boolean {
  const code = (declineCode ?? "").toLowerCase();
  return code !== "idempotency_key_in_use" && code !== "idempotency_error";
}

/**
 * A card is expired from the END of its expiry month — a card marked
 * 11/2026 is good all through November. Getting this off by a month
 * sends a client to re-enter a card that still works.
 */
export function cardExpired(card: CardOnFile, now: Date): boolean {
  const m = card.stripeCardExpMonth;
  const y = card.stripeCardExpYear;
  if (!m || !y) return false; // A wallet or Link method carries no expiry.
  const endOfMonth = new Date(Date.UTC(y, m, 1)); // first instant of the NEXT month
  return now.getTime() >= endOfMonth.getTime();
}

export function cardChargeAvailability(input: {
  card: CardOnFile | null | undefined;
  owingCents: number;
  stripeConfigured: boolean;
  now: Date;
}): CardChargeAvailability {
  if (!input.stripeConfigured) {
    return { state: "stripe_off", action: "Card on file", hint: "Stripe is not configured on this deployment." };
  }
  const card = input.card ?? {};
  const hasCard = Boolean(card.stripeCustomerId && card.stripeDefaultPaymentMethodId);
  if (!hasCard) {
    return {
      state: "needs_card",
      action: "Add a card",
      hint: "Opens Stripe's secure page. The card is saved to this client for next time.",
    };
  }
  if (cardExpired(card, input.now)) {
    return {
      state: "expired",
      action: "Replace card",
      hint: "The card on file has expired. Opens Stripe's secure page.",
    };
  }
  if (input.owingCents <= 0) {
    return { state: "nothing_owing", action: "Charge card on file", hint: "Nothing is owing on this booking." };
  }
  return { state: "chargeable", action: "Charge card on file", hint: null };
}

/**
 * The key that stops a double-click becoming a double charge.
 *
 * Stripe returns the ORIGINAL PaymentIntent for a repeated idempotency
 * key, so the second press of the button gets the first charge back
 * instead of making another one.
 *
 * It is derived rather than random, and that is the whole point. A
 * random key per click makes two clicks two charges. This folds in what
 * has already been paid, so once the first charge lands the booking
 * owes less, the key changes, and a genuine second payment — a tip, or
 * an extra added after the fact — is still allowed through.
 */
export function chargeIdempotencyKey(input: {
  appointmentIds: readonly number[];
  amountCents: number;
  alreadyPaidCents: number;
  /**
   * The card being charged. Leaving this out is what broke it the
   * first time — see below.
   */
  paymentMethodId: string;
}): string {
  const ids = [...input.appointmentIds].sort((a, b) => a - b).join(".");
  /*
   * The payment method is part of what makes this "the same charge".
   *
   * Without it, a key pinned a booking and an amount but not the card.
   * Stripe refuses a reused key whose parameters changed, so the moment
   * a client replaced their card after a failed attempt, that booking
   * became permanently uncharageable:
   *
   *   Keys for idempotent requests can only be used with the same
   *   parameters they were first used with.
   *
   * Which is exactly the common case — the card declines, the client
   * hands over another one. Hit on 03/11/2026 on the first real attempt
   * after a card was replaced.
   *
   * Last 10 characters only: payment method ids share a long prefix, and
   * the tail is what differs. The whole id would push the key past
   * Stripe's 255-character limit on a booking with several dogs.
   */
  const card = input.paymentMethodId.slice(-10);
  return `gsos_appt_${ids}_amt_${input.amountCents}_paid_${input.alreadyPaidCents}_pm_${card}`;
}

/** What staff see when Stripe says no. */
export function describeChargeFailure(declineCode: string | null, message: string | null): string {
  const code = (declineCode ?? "").toLowerCase();
  /*
   * NOT a decline, and calling it one is worse than saying nothing.
   *
   * Stripe returns this when a request carrying the same idempotency
   * key is still in flight — which is the double-click working exactly
   * as designed. The other request is about to return the real answer.
   * Seen for the first time on a live two-request test on 03/11/2026,
   * where it was reported to the operator as "The card was declined
   * (idempotency_key_in_use)". A receptionist reading that would ask
   * the client for another card while the first charge was going
   * through.
   */
  if (code === "idempotency_key_in_use") {
    return "That charge is already going through — wait a moment and check the booking before trying again.";
  }
  /*
   * Stripe saying our key was reused with different parameters. That is
   * a fault in this software, not a problem with the client's card, and
   * telling a receptionist "declined" would send them to ask for
   * another one — which is what caused this in the first place.
   */
  if (code === "idempotency_error") {
    return "Something is wrong at our end, not with the card. Nothing was charged — tell Andy, and take the payment another way for now.";
  }
  if (code === "authentication_required") {
    return "The bank wants the client to approve this one. Ask them to pay on the terminal, or send them a card link.";
  }
  if (code === "insufficient_funds") return "Declined — insufficient funds.";
  if (code === "expired_card") return "Declined — the card on file has expired. Ask the client to add a new one.";
  if (code === "card_declined" || code === "generic_decline") return "The card was declined.";
  if (code) return `The card was declined (${code}).`;
  return message?.trim() || "The charge did not go through.";
}
