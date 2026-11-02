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
}): string {
  const ids = [...input.appointmentIds].sort((a, b) => a - b).join(".");
  return `gsos_appt_${ids}_amt_${input.amountCents}_paid_${input.alreadyPaidCents}`;
}

/** What staff see when Stripe says no. */
export function describeChargeFailure(declineCode: string | null, message: string | null): string {
  const code = (declineCode ?? "").toLowerCase();
  if (code === "authentication_required") {
    return "The bank wants the client to approve this one. Ask them to pay on the terminal, or send them a card link.";
  }
  if (code === "insufficient_funds") return "Declined — insufficient funds.";
  if (code === "expired_card") return "Declined — the card on file has expired. Ask the client to add a new one.";
  if (code === "card_declined" || code === "generic_decline") return "The card was declined.";
  if (code) return `The card was declined (${code}).`;
  return message?.trim() || "The charge did not go through.";
}
