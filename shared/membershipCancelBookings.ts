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
 * styled etc)."
 *
 * So the staff member always chooses; nothing is assumed. "Normal price"
 * is the price list's figure for that service and that dog's size at the
 * rate somebody with no membership pays — the same default the booking
 * form would fill in for them (groomPricing.ts).
 */
import {
  clientPriceTier,
  groomPriceOptions,
  pickDefaultPriceOption,
  type PriceCatalogueItem,
} from "./groomPricing";

export const FUTURE_BOOKING_CHOICES = ["keep", "remove"] as const;
export type FutureBookingChoice = (typeof FUTURE_BOOKING_CHOICES)[number];

type SizeBand = Parameters<typeof groomPriceOptions>[0]["sizeBand"];

export type NormalPrice =
  | { price: string; from: string }
  /** No figure could be worked out; the booking is left with no price for staff to fill in. */
  | { price: null; why: "no_size" | "not_on_price_list" };

/**
 * The price a booking goes back to once the membership is gone.
 *
 * Deliberately refuses to guess. With no size band recorded, every row
 * for the service would be a candidate and the "default" would be
 * whichever came first — a giant's price on a toy poodle. That booking
 * is left blank instead, and the caller says so.
 */
export function normalPriceWithoutMembership(input: {
  serviceType: string;
  sizeBand: SizeBand;
  catalogue: readonly PriceCatalogueItem[];
}): NormalPrice {
  if (!input.sizeBand) return { price: null, why: "no_size" };
  const options = groomPriceOptions({
    serviceType: input.serviceType,
    sizeBand: input.sizeBand,
    catalogue: input.catalogue,
  });
  // No membership any more, so the rate is the one a non-member pays.
  const pick = pickDefaultPriceOption(options, clientPriceTier({ membershipTier: null }));
  if (!pick || pick.requiresManualPrice || pick.priceAud === null) {
    return { price: null, why: "not_on_price_list" };
  }
  return { price: Number(pick.priceAud).toFixed(2), from: pick.name };
}

/**
 * What a KEPT booking's price becomes.
 *
 * "Revert to the normal price" undoes what the membership did, which was
 * to make the groom nil. So only a booking the membership had zeroed (or
 * that never had a price) is repriced. A booking that already carries a
 * real figure — a price brought across from MoeGo, or one staff typed —
 * keeps it: overwriting those with the price list would quietly change
 * what clients have already been quoted.
 */
export function keptBookingPrice(
  currentPrice: string | number | null | undefined,
  normal: NormalPrice,
): { change: false } | { change: true; price: string | null } {
  const current = currentPrice === null || currentPrice === undefined || String(currentPrice).trim() === ""
    ? null
    : Number(currentPrice);
  if (current !== null && Number.isFinite(current) && Math.abs(current) > 0.004) return { change: false };
  return { change: true, price: normal.price };
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
    if (result.repriced > 0) parts.push(`${result.repriced} now at the normal price`);
    if (asPriced > 0) parts.push(`${asPriced} left at the price already on ${asPriced === 1 ? "it" : "them"}`);
    if (result.needPrice > 0) parts.push(`${result.needPrice} still ${result.needPrice === 1 ? "needs" : "need"} a price`);
    return `${head}: ${parts.join(", ")}.`;
  }
  return "";
}
