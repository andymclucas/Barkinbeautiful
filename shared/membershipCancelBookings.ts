/**
 * What happens to a dog's future bookings when its membership is cancelled.
 *
 * Lauren, 18/11/2026: a client had cancelled her membership a while ago,
 * Groomigo still showed it, and the dog's future bookings sat at nil —
 * "how do I remove the tag and also update all future bookings to $110
 * instead of the $0 pricing". Cancelling never touched the bookings, so
 * every one stayed tied to the dead membership and priced at nothing.
 *
 * Andy, 18/11/2026: "when a membership is cancelled, it will prompt the
 * staff member to check if they want to remove all future bookings or
 * leave them. If they choose to leave them, it will revert to the normal
 * price for the appt (depending on dog weight band and whether classic or
 * styled etc)." And, the same day, on which price that is: "0024 gives 3
 * rates plus custom rate."
 *
 * So the staff member always chooses, twice over: whether the bookings
 * stay, and — for each one that stays — what it costs. The system offers
 * the price list's new-client, regular-client and VIP rates for that
 * service at the dog's size (sizeChangePricing.ts, the same three the
 * size-change prompt offers) and a box for their own figure. It never
 * picks a rate itself: for the dog in Lauren's report the three were
 * $180, $163 and $145, and she expected $110.
 */
import { resolveSizePrice, type SizePriceChoice, type SizePriceDecision } from "./sizeChangePricing";

export const FUTURE_BOOKING_CHOICES = ["keep", "remove"] as const;
export type FutureBookingChoice = (typeof FUTURE_BOOKING_CHOICES)[number];

/** A real price: not blank, and not nil. */
export function hasRealPrice(price: string | number | null | undefined): boolean {
  if (price === null || price === undefined || String(price).trim() === "") return false;
  const amount = Number(price);
  return Number.isFinite(amount) && Math.abs(amount) > 0.004;
}

export type KeptBooking = {
  id: number;
  currentPrice: string | null;
  choices: readonly SizePriceChoice[];
  /** The bill was set by hand, so the price is not what gets charged; it is left alone. */
  hasBillingOverride?: boolean;
};

/** Said when somebody tries to keep a booking at nothing. */
export const ZERO_KEPT_PRICE_MESSAGE = "Type a price above $0, or choose \"No price yet\".";

export type KeptPricesResult =
  | { ok: true; prices: { appointmentId: number; price: string }[]; leftBlank: number; keptAsPriced: number }
  | { ok: false; errors: Record<number, string> };

/**
 * Turn what staff picked for each kept booking into the prices to save.
 *
 * A booking that already carries a real price starts on "leave" and keeps
 * it unless staff choose otherwise — a figure brought across from MoeGo,
 * or one somebody typed, is not overwritten behind their back.
 *
 * A booking the membership had made free has no such default. It has to
 * be answered: a rate, their own price, or "leave", which for that
 * booking means no price yet (blank for staff to fill in, never nil).
 * Unanswered, the cancel does not go ahead.
 */
export function resolveKeptPrices(
  bookings: readonly KeptBooking[],
  decisions: Readonly<Record<number, SizePriceDecision | undefined>>,
): KeptPricesResult {
  const prices: { appointmentId: number; price: string }[] = [];
  const errors: Record<number, string> = {};
  let leftBlank = 0;
  let keptAsPriced = 0;

  for (const booking of bookings) {
    const real = hasRealPrice(booking.currentPrice);
    // A hand-set bill ignores the price, so there is nothing to choose.
    if (booking.hasBillingOverride) {
      if (real) keptAsPriced += 1; else leftBlank += 1;
      continue;
    }
    const decision = decisions[booking.id] ?? (real ? { kind: "leave" as const } : undefined);
    if (!decision) {
      errors[booking.id] = "Choose a price for this booking.";
      continue;
    }
    if (decision.kind === "leave") {
      if (real) keptAsPriced += 1; else leftBlank += 1;
      continue;
    }
    const resolved = resolveSizePrice({ decision, choices: booking.choices, currentPrice: booking.currentPrice });
    if ("error" in resolved) {
      errors[booking.id] = resolved.error;
    } else if (resolved.change) {
      // Nil is exactly what the membership left behind. A kept booking is
      // never saved at $0: that would be the same free groom by another door.
      if (!hasRealPrice(resolved.price)) errors[booking.id] = ZERO_KEPT_PRICE_MESSAGE;
      else prices.push({ appointmentId: booking.id, price: resolved.price });
    } else if (real) {
      // Picking the price it already has is not a change, but it is an answer.
      keptAsPriced += 1;
    } else {
      // "No change" on a free booking can only mean somebody typed $0.
      errors[booking.id] = ZERO_KEPT_PRICE_MESSAGE;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, prices, leftBlank, keptAsPriced };
}

/**
 * What one kept booking's price becomes on the server.
 *
 * `chosen` is the price staff picked for it, if they picked one. With no
 * pick, a real price stays and a nil or blank one is left blank — never
 * left at the member's nil, which is the bug this exists to close.
 */
export function keptBookingPrice(
  currentPrice: string | number | null | undefined,
  chosen: string | null | undefined,
): { change: false } | { change: true; price: string | null } {
  if (chosen !== null && chosen !== undefined) return { change: true, price: chosen };
  if (hasRealPrice(currentPrice)) return { change: false };
  return { change: true, price: null };
}

/** One line the dialog and the toast can both use. */
export function describeFutureBookingOutcome(result: {
  choice: FutureBookingChoice | null;
  removed: number;
  repriced: number;
  needPrice: number;
  /** Kept with the real price they already had. */
  keptAsPriced?: number;
}): string {
  if (result.choice === "remove") {
    return result.removed === 1 ? "1 future booking removed." : `${result.removed} future bookings removed.`;
  }
  if (result.choice === "keep") {
    const asPriced = result.keptAsPriced ?? 0;
    const kept = result.repriced + result.needPrice + asPriced;
    const head = kept === 1 ? "1 future booking kept" : `${kept} future bookings kept`;
    const parts: string[] = [];
    if (result.repriced > 0) parts.push(`${result.repriced} at the price you chose`);
    if (asPriced > 0) parts.push(`${asPriced} left at the price already on ${asPriced === 1 ? "it" : "them"}`);
    if (result.needPrice > 0) parts.push(`${result.needPrice} still ${result.needPrice === 1 ? "needs" : "need"} a price`);
    return `${head}: ${parts.join(", ")}.`;
  }
  return "";
}
