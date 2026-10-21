/**
 * What an online booking is quoted, and why that figure is an estimate.
 *
 * The public picks a service and types a weight. That is enough to read
 * a price off the salon's own catalogue — the same rows staff quote
 * from — and showing nothing instead would send every booking to a
 * phone call, which is the thing online booking exists to avoid.
 *
 * It is NOT a quote, and must never read as one.
 *
 * Andy, 21/10/2026: "Price needs to have a disclaimer that although
 * price is dependant on dog weight and appt duration, this is subject
 * to change."
 *
 * Both halves of that matter. A weight typed by an owner is a guess
 * often enough — 10,372 of 12,552 dogs here have no recorded weight, so
 * nobody has checked most of them — and the band it lands in is what
 * picks the price. And a groom that takes longer than the band assumes,
 * because the coat is matted or the dog will not stand, costs more than
 * the band says. Either can move the figure on the day.
 *
 * So the estimate always travels with ESTIMATE_DISCLAIMER, in the same
 * words, wherever it appears: the booking page, the confirmation email
 * and the confirmation text. One constant, so the three cannot drift
 * into saying different things about the same money.
 */

import { getMembershipWeightBand } from "./membershipPackages";
import {
  groomPriceOptions, pickDefaultPriceOption, clientPriceTier,
  type PriceCatalogueItem, type PriceOption, type PriceTier,
} from "./groomPricing";
import { bandForWeight, type DogSizeBand } from "./dogSizeBand";

/** The sentence shown wherever an online price appears. */
export const ESTIMATE_DISCLAIMER =
  "This price is an estimate based on your dog's weight and how long the groom usually takes. "
  + "It can change on the day — if your dog weighs more than entered, or the coat needs longer "
  + "than usual, we'll talk to you before we start.";

/** The short form, for a text message where every character is billed. */
export const ESTIMATE_DISCLAIMER_SHORT =
  "Price is an estimate and may change on the day.";

export type OnlineBookingEstimate =
  | { known: true; price: string; sizeBand: DogSizeBand; disclaimer: string }
  | { known: false; reason: string; range?: { low: string; high: string } };

/**
 * Candidate rows that are genuinely interchangeable for this dog.
 *
 * `pickDefaultPriceOption` returns the FIRST of its best-matching group,
 * which is right for a staff member — they see the whole list beside it
 * and change it in one click. It is wrong for an automatic quote, where
 * nobody checks. This rebuilds the same group so the caller can ask the
 * question that matters here: is there one answer, or several?
 */
function sameTierCandidates(options: readonly PriceOption[], tier: PriceTier): PriceOption[] {
  const priced = options.filter((o) => !o.requiresManualPrice && o.priceAud !== null);
  const pool = priced.length > 0 ? priced : options;
  for (const group of [
    pool.filter((o) => o.tier === tier && o.bandSpecific),
    pool.filter((o) => o.tier === tier),
    pool.filter((o) => o.tier === null && o.bandSpecific),
    pool.filter((o) => o.tier === null),
  ]) {
    if (group.length > 0) return group;
  }
  return [];
}

/**
 * The estimate for one dog, one service, one weight.
 *
 * Returns "not known" rather than a guess in two cases, and the second
 * is the one that matters:
 *
 * 1. The catalogue has no row for that service and size. A 30kg classic
 *    groom is a live example — the Extra Large band carries VIP and
 *    Regular rows but no New Client row.
 *
 * 2. **The catalogue has SEVERAL rows and a weight cannot choose between
 *    them.** Not hypothetical; measured against the live catalogue on
 *    21/10/2026:
 *
 *      - `deshed` is three unbanded rows — $120 (1 hour), $220 (2
 *        hours), $330 (3 hours) — told apart only by the duration in
 *        the name. Taking the first quoted **$120 for a 45kg
 *        long-haired dog whose real price is $330**: out by $210, in
 *        the direction the salon pays for.
 *      - `bath_only` carries both "Bath & Blow-dry" and "Quick Clean
 *        (Towel Dry)"; `fft` carries both a short-hair and a long-hair
 *        tidy. Both came out NON-MONOTONIC — a 12kg bath quoted $50
 *        against $60 for a 5kg, and a 15kg tidy $110 against $120 for
 *        a 12kg.
 *
 *    None of that is a catalogue error. Those rows are right and a
 *    groomer reads the names and picks. It is only wrong when a weight
 *    alone is asked to decide, which is all this function has. So it
 *    declines and hands back the range for the page to show.
 *
 * `classic_groom` and `styled_groom` — the two services this mostly
 * exists for — are unambiguous: one named tier per band, and a stranger
 * gets the New Client row.
 */
export function estimateOnlineBookingPrice(input: {
  serviceType: string;
  weightKg: number;
  catalogue: readonly PriceCatalogueItem[];
}): OnlineBookingEstimate {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return { known: false, reason: "We need your dog's weight to estimate a price." };
  }
  const sizeBand = bandForWeight(input.weightKg);
  if (!sizeBand) {
    return { known: false, reason: "We'll confirm the price for your dog's size when we call." };
  }
  const options = groomPriceOptions({
    serviceType: input.serviceType,
    sizeBand,
    catalogue: input.catalogue,
  });
  /**
   * Priced as a NEW client, always.
   *
   * Someone booking through the public page has no membership — that is
   * what `clientPriceTier` returns for an empty tier, and it is the
   * dearer end of the ladder. Quoting a member's rate to a stranger and
   * correcting it on the day is the one direction of error that feels
   * like a bait and switch; a returning member books through the salon
   * or the portal, where their real tier is known.
   */
  const tier = clientPriceTier({});
  const candidates = sameTierCandidates(options, tier);
  const prices = Array.from(new Set(
    candidates.map((o) => o.priceAud).filter((p): p is string => p !== null),
  )).sort((a, b) => Number(a) - Number(b));

  if (prices.length === 0) {
    return { known: false, reason: "We'll confirm the price for this service when we call." };
  }
  if (prices.length > 1) {
    // Several legitimate prices and the dog's weight cannot say which.
    // The range is more use than nothing, and far more honest than the
    // cheapest of them.
    return {
      known: false,
      reason: "This groom is priced on the day, once we've seen your dog's coat.",
      range: { low: prices[0], high: prices[prices.length - 1] },
    };
  }

  const chosen = pickDefaultPriceOption(options, tier);
  if (!chosen || chosen.priceAud === null) {
    return { known: false, reason: "We'll confirm the price for this service when we call." };
  }
  return {
    known: true,
    price: chosen.priceAud,
    sizeBand,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}

/**
 * The weight band as the salon's membership bands name it, for the note
 * written onto the appointment. Kept separate from the price band
 * because the two sets of bands are not the same and conflating them is
 * how a dog gets priced in one band and timed in another.
 */
export function describeBookedWeight(weightKg: number): string {
  const band = getMembershipWeightBand(weightKg);
  return band ? `${band.label} (${weightKg}kg, as entered)` : `${weightKg}kg, as entered`;
}
