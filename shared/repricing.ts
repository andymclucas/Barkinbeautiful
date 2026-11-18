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
import { priceForCoveredAppointment } from "./appointmentMembershipCoverage";
import { departedPetsIn, type BookablePet } from "./petBookable";

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

/**
 * The new figure after a service change, or why there is not one.
 *
 * The 22/10 fix left three silent gaps (fix desk 0009, Andy 16/11/2026):
 * a dog with no size on file, a service with no list price, and a member
 * moved onto a groom its plan covers, which got the members' rate when a
 * covered groom carries no price. The first two now come back WITH a
 * reason so the dialog can say so; the box is still never blanked.
 *
 * Two more reasons since the Release Manager's review (17/11/2026), both
 * cases that used to say nothing, or worse:
 *
 * - `coverage-unknown`: a classic or styled groom while the membership
 *   answer is still loading, or failed. Pricing it at the list rate then
 *   would be the original bug again, a member's covered groom charged the
 *   members' rate under a green "updated" toast. So it is left alone and
 *   staff are told to check it.
 * - `no-pricing-data`: the dog's size and tier, or the price list, have
 *   not loaded. Nothing can be worked out, so say so.
 *
 * `coverage` is the booking path's own answer (coverageForServiceChange).
 * This does not decide coverage, it only applies the price that rule implies.
 */
export type NotRepricedReason = "no-size" | "no-list-price" | "coverage-unknown" | "no-pricing-data";

export type ServiceChangePricing =
  | { kind: "covered"; price: string; from: string | null }
  | { kind: "repriced"; price: string; from: string | null }
  | { kind: "unchanged" }
  | { kind: "not-repriced"; reason: NotRepricedReason };

export type CoverageAnswer = "covered" | "not-covered" | "unknown";

/** The services a grooming plan can cover; nothing else is $0 by membership. */
export const PLAN_COVERABLE_SERVICES: readonly string[] = ["classic_groom", "styled_groom"];

/**
 * The dogs on a booking that the coverage check may be asked about.
 *
 * calendar.getMembershipCoverage refuses the whole request if any dog in
 * it is archived or has passed away (departedBookingMessage), and the app
 * turns every refused query into a red error toast. So those dogs are
 * left out, and are never covered: a plan does not cover a dog that
 * cannot be booked. pets.listByClient already leaves archived dogs out,
 * so a dog missing from it counts as archived.
 *
 * Returns null while the client's dog list has not loaded.
 */
export function bookablePetIdsForCoverage(
  petIds: readonly number[],
  clientPets: readonly BookablePet[] | undefined,
): number[] | null {
  if (!clientPets) return null;
  const blocked = new Set(departedPetsIn([...clientPets]).map((pet) => pet.id));
  const listed = new Set(clientPets.map((pet) => pet.id));
  return Array.from(new Set(petIds)).filter((id) => listed.has(id) && !blocked.has(id));
}

/**
 * Whether the membership covers this dog on the new service.
 *
 * The rule is the one every insert path on the server uses, the new
 * multi-dog booking and rebook included:
 * `priceForCoveredAppointment(coverage.fullyCovered, price)`, with
 * coverage asked for the booking's dogs on that one service. A dog is $0
 * only when EVERY dog on the booking is covered for that service; in a
 * family where one dog is a member and one is casual, both keep a price
 * (routers.ts explains why a mixed family legitimately carries one).
 * Andy's limit for 0009 was to reuse that rule, not write a second one.
 *
 * - Not a groom a plan can cover: not covered.
 * - Dog list not loaded, or the coverage answer not in (loading or
 *   failed): unknown, and the caller must not price it.
 * - This dog is archived or has passed away: not covered.
 */
export function coverageForServiceChange(input: {
  serviceType: string;
  petId: number;
  bookablePetIds: readonly number[] | null;
  fullyCovered: boolean | undefined;
}): CoverageAnswer {
  if (!PLAN_COVERABLE_SERVICES.includes(input.serviceType)) return "not-covered";
  if (input.bookablePetIds === null) return "unknown";
  if (!input.bookablePetIds.includes(input.petId)) return "not-covered";
  if (input.fullyCovered === undefined) return "unknown";
  return input.fullyCovered ? "covered" : "not-covered";
}

export function priceAfterServiceChange(input: {
  serviceType: string;
  /** False while the dog's size and tier, or the price list, have not loaded. */
  pricingLoaded: boolean;
  sizeBand: DogSizeBand | null | undefined;
  tier: PriceTier;
  catalogue: readonly PriceCatalogueItem[];
  currentPrice: string | null | undefined;
  coverage: CoverageAnswer;
}): ServiceChangePricing {
  const current = String(input.currentPrice ?? "").trim();
  const covered = priceForCoveredAppointment(input.coverage === "covered", undefined);
  if (covered !== undefined) {
    if (current !== "" && Number(current) === Number(covered)) return { kind: "unchanged" };
    return { kind: "covered", price: covered, from: current || null };
  }
  if (input.coverage === "unknown") return { kind: "not-repriced", reason: "coverage-unknown" };
  if (!input.pricingLoaded || input.catalogue.length === 0) {
    return { kind: "not-repriced", reason: "no-pricing-data" };
  }
  const outcome = repriceForService(input);
  if (outcome.repriced) return { kind: "repriced", price: outcome.price, from: outcome.from };
  if (outcome.reason === "already-correct") return { kind: "unchanged" };
  return { kind: "not-repriced", reason: input.sizeBand ? "no-list-price" : "no-size" };
}

/** What staff are told when a service change could not move the price. */
export function notRepricedMessage(input: {
  reason: NotRepricedReason;
  serviceLabel: string;
  petName?: string | null;
  currentPrice: string | null | undefined;
}): string {
  const lead = input.petName ? `${input.petName}: price` : "Price";
  const why = {
    "no-size": "no size on file for this dog",
    "no-list-price": `no list price for ${input.serviceLabel} at this dog's size`,
    "coverage-unknown": "the membership could not be checked yet",
    "no-pricing-data": "the dog's size and the price list could not be loaded",
  }[input.reason];
  const current = String(input.currentPrice ?? "").trim();
  const left = current === "" ? "The price is still empty" : `The price is still $${current}`;
  return `${lead} not changed (${why}). ${left}, so check it before saving.`;
}
