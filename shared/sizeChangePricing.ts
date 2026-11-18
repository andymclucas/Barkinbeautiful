/**
 * The price question asked when a dog's size changes.
 *
 * A dog's size band sets its price, but changing the weight (or the size
 * itself) used to change nothing on bookings already made: Samson went
 * from one band to another and his January booking kept the old figure,
 * with nobody told. Andy, 18/11/2026: "When a price prompt is triggered
 * from dog weight change, give staff the option for the 3 pricing options,
 * or the ability to enter their own custom price."
 *
 * So nothing is repriced automatically. Staff are shown each upcoming
 * booking with the three rates the price list has for that service at the
 * dog's NEW size — new client, regular client, VIP client — and may pick
 * one, type their own figure, or leave the booking as it is.
 */
import {
  PRICE_TIERS,
  PRICE_TIER_LABELS,
  groomPriceOptions,
  type PriceCatalogueItem,
  type PriceTier,
} from "./groomPricing";

type SizeBand = Parameters<typeof groomPriceOptions>[0]["sizeBand"];

export type SizePriceChoice = {
  tier: PriceTier;
  /** "New client", "Regular client", "VIP client". */
  label: string;
  /** Two decimals, as the price column holds it. */
  price: string;
  /** The price-list row it came from, so staff can see what they are picking. */
  from: string;
};

/**
 * Up to three choices, one per rate, in the price list's own order.
 *
 * A rate with no priced row for this service and size is simply absent:
 * a missing option is honest, a guessed one is a wrong price with a
 * confident label. With no size at all there is nothing to offer.
 */
export function sizePriceChoices(input: {
  serviceType: string;
  sizeBand: SizeBand;
  catalogue: readonly PriceCatalogueItem[];
}): SizePriceChoice[] {
  if (!input.sizeBand) return [];
  const options = groomPriceOptions({
    serviceType: input.serviceType,
    sizeBand: input.sizeBand,
    catalogue: input.catalogue,
  }).filter((option) => !option.requiresManualPrice && option.priceAud !== null);

  const choices: SizePriceChoice[] = [];
  for (const tier of PRICE_TIERS) {
    const ofTier = options.filter((option) => option.tier === tier);
    // A row that names this dog's band beats a catch-all, as in the booking form.
    const pick = ofTier.find((option) => option.bandSpecific) ?? ofTier[0];
    if (!pick) continue;
    choices.push({
      tier,
      label: PRICE_TIER_LABELS[tier],
      price: Number(pick.priceAud).toFixed(2),
      from: pick.name,
    });
  }
  return choices;
}

/** What staff decided for one booking. */
export type SizePriceDecision =
  | { kind: "leave" }
  | { kind: "tier"; tier: PriceTier }
  | { kind: "custom"; amount: string };

export type ResolvedSizePrice =
  | { change: false }
  | { change: true; price: string }
  | { change: false; error: string };

/**
 * The price a decision comes to, or why it cannot be used.
 *
 * A custom figure is checked here rather than trusted: blank, negative,
 * or not a number is refused with words staff can act on. Choosing the
 * price the booking already has is not a change.
 */
export function resolveSizePrice(input: {
  decision: SizePriceDecision;
  choices: readonly SizePriceChoice[];
  currentPrice: string | number | null | undefined;
}): ResolvedSizePrice {
  const { decision } = input;
  if (decision.kind === "leave") return { change: false };

  let price: string;
  if (decision.kind === "tier") {
    const choice = input.choices.find((candidate) => candidate.tier === decision.tier);
    if (!choice) return { change: false, error: "That price is not on the price list for this size." };
    price = choice.price;
  } else {
    const text = decision.amount.trim().replace(/^\$/, "");
    if (text === "") return { change: false, error: "Type a price, or pick one of the options." };
    // Dollars and at most two decimals. Number() alone would read "1e3"
    // as a thousand dollars and "0x10" as sixteen.
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return { change: false, error: "That price doesn't look right." };
    const amount = Number(text);
    if (amount > 10000) return { change: false, error: "That price is too high to be right." };
    price = amount.toFixed(2);
  }

  const current = input.currentPrice === null || input.currentPrice === undefined || String(input.currentPrice).trim() === ""
    ? null
    : Number(input.currentPrice);
  if (current !== null && Number.isFinite(current) && Math.abs(current - Number(price)) < 0.005) return { change: false };
  return { change: true, price };
}
