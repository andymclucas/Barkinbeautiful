/**
 * What a dog should cost when its service changes.
 *
 * Lauren, 22/10/2026: "Miller changed to a tidy, I changed his service
 * and saved. went back and checked his price and it was still the groom
 * price, So I manually changed it."
 *
 * The new-booking form already re-prices every dog when the service
 * changes — see BookingPetPricing, "a classic groom's figure is not a
 * styled groom's, so carrying it over would leave a wrong number in a
 * box that looks filled in". The edit dialog did not, so a tidy went out
 * at the groom price until somebody noticed. Miller is a $110 tidy
 * against a $200 groom.
 *
 * Two things this deliberately does NOT do:
 *
 * - **It does not run when a dialog opens.** It is called from the
 *   service dropdown's own change handler, so it only ever fires
 *   because a person picked a different service. An effect watching the
 *   service would also fire on mount and overwrite a price somebody set
 *   by hand last week.
 * - **It does not blank the box.** A service and size with no catalogue
 *   row returns null, meaning "leave what is there". Clearing a real
 *   figure because the catalogue has a gap would turn a wrong price
 *   into no price, which invoices as zero.
 */

import { groomPriceOptions, pickDefaultPriceOption, type PriceCatalogueItem, type PriceTier } from "./groomPricing";
import type { DogSizeBand } from "./dogSizeBand";

/**
 * The catalogue price for this service at this dog's size and tier, or
 * null when the catalogue cannot answer.
 */
export function catalogueePriceFor(input: {
  serviceType: string;
  sizeBand: DogSizeBand | null | undefined;
  tier: PriceTier;
  catalogue: readonly PriceCatalogueItem[];
}): string | null {
  if (!input.sizeBand) return null;
  const options = groomPriceOptions({
    serviceType: input.serviceType,
    sizeBand: input.sizeBand,
    catalogue: input.catalogue,
  });
  const chosen = pickDefaultPriceOption(options, input.tier);
  return chosen?.priceAud ?? null;
}

export type RepriceOutcome =
  | { repriced: true; price: string; from: string | null }
  | { repriced: false; reason: "no-catalogue-price" | "already-correct" };

/**
 * Whether and how to move the price box after a service change.
 *
 * Returns `already-correct` when the figure is the one the catalogue
 * would produce anyway, so a caller can stay quiet rather than
 * announcing a change that did not happen.
 */
export function repriceForService(input: {
  serviceType: string;
  sizeBand: DogSizeBand | null | undefined;
  tier: PriceTier;
  catalogue: readonly PriceCatalogueItem[];
  currentPrice: string | null | undefined;
}): RepriceOutcome {
  const price = catalogueePriceFor(input);
  if (price === null) return { repriced: false, reason: "no-catalogue-price" };
  const current = String(input.currentPrice ?? "").trim();
  if (current !== "" && Number(current) === Number(price)) {
    return { repriced: false, reason: "already-correct" };
  }
  return { repriced: true, price, from: current || null };
}
