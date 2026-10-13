/**
 * What a groom costs, worked out from the catalogue rather than guessed.
 *
 * The salon's price list already lives in `pricing_services`, keyed by
 * service and a weight band — 43 active rows. Nothing read it at booking
 * time, so the New Appointment dialog offered one empty "Price ($)" box for
 * the whole booking and staff typed a number from memory. Two consequences,
 * both live:
 *
 *   - Prices drifted from the list. Lauren books the same dogs in MoeGo and
 *     gets last time's figure filled in; here she had to guess.
 *   - A multi-dog booking has ONE box and several dogs, so the salon put the
 *     whole family's fee on the first dog and left the siblings NULL. 80 of
 *     the 102 unpriced appointments found on 12/10/2026 are that, not missing
 *     revenue. One box is the cause; a price per dog is the fix.
 *
 * Everything here is pure so it can be tested without a database, and so a
 * second salon's catalogue — different services, different bands, different
 * tier names — runs through the same code.
 */
import { MEMBERSHIP_WEIGHT_BANDS } from "./membershipPackages";
import type { DogSizeBand } from "./dogSizeBand";
import type { ServiceType } from "./serviceTypes";

/**
 * The three price columns the salon keeps for the same groom.
 *
 * A small classic groom is $145 for a first visit, $125 once they are a
 * regular, $110 for a VIP. The tier is not a column — it is written into
 * the catalogue item's NAME ("Full Groom (Classic) - Regular Client -
 * Small"), which is the only place the data holds it.
 *
 * `null` is a first-class answer and the common one: "Nail Clipping" and
 * the de-sheds carry no tier at all. An untiered item is a candidate for
 * every client, which is also the right behaviour for a salon that does not
 * price this way — nothing in their names matches, so every item is
 * untiered and they simply get one price per service and size.
 */
export const PRICE_TIERS = ["new", "regular", "vip"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const PRICE_TIER_LABELS: Record<PriceTier, string> = {
  new: "New client",
  regular: "Regular client",
  vip: "VIP client",
};

/**
 * The tier a catalogue item's name declares, or null when it declares none.
 *
 * Matched on the whole phrase ("new client"), not on "new" alone, so an
 * item called "Puppy's First Groom" is not read as a new-client price.
 */
export function tierFromCatalogueName(name: string | null | undefined): PriceTier | null {
  if (!name) return null;
  const text = name.toLowerCase();
  if (text.includes("new client")) return "new";
  if (text.includes("regular client")) return "regular";
  if (text.includes("vip client")) return "vip";
  return null;
}

/**
 * Which rate this DOG should be quoted, from its membership.
 *
 * The three tiers are MoeGo's, and all three are membership facts rather
 * than loyalty ones:
 *
 *   Casual / NEW customer        -> "new"      — not a member
 *   Bronze (8wks)                -> "regular"  — the 8-weekly membership
 *   Diamond - Gold (up to 6wks)  -> "vip"      — every shorter interval
 *
 * It used to key on whether the client had ever had a groom finished,
 * which made every returning client a Bronze member for pricing purposes —
 * 703 of 963 upcoming bookings were being quoted a members' rate, around
 * $20 a dog under the casual price. Andy, 13/10/2026: "Only actual members
 * get Bronze, everyone else pays Casual."
 *
 * Per DOG, not per client: memberships hang off the pet, so one household
 * can have a Gold poodle and an unenrolled schnauzer.
 *
 * Silver sits with Diamond and Gold deliberately, and this is the most
 * consequential line in the function — 124 of the upcoming membership
 * bookings are silver. Confirmed against MoeGo on 13/10/2026 rather than
 * assumed: MoeGo's service label is "Diamond - Gold (up to 6wks)" and
 * silver's appointment interval is exactly 6 weeks, so it is inside that
 * band. The interval comes from MEMBERSHIP_WEIGHT_BANDS' sibling table in
 * membershipPackages.ts, which is itself verified — its bronze weekly
 * prices ([15, 19, 24, 27, 30, 34]) match MoeGo's Bronze VIP Classic plans
 * on all six bands, and silver's ([17, 22, 27, 31, 40, 44]) match too.
 *
 * Most member bookings never reach a price at all: when the membership
 * covers that groom the dialog forces $0.00 before this matters. This
 * decides what a member pays for a groom their membership does NOT cover —
 * a Classic member booking a styled cut, say.
 */
export const BRONZE_MEMBERSHIP_TIER = "bronze";

export function clientPriceTier(input: { membershipTier?: string | null }): PriceTier {
  const tier = (input.membershipTier ?? "").trim().toLowerCase();
  if (tier === "") return "new";
  if (tier === BRONZE_MEMBERSHIP_TIER) return "regular";
  return "vip";
}

/**
 * Every size band a catalogue item's `weight_band` string covers.
 *
 * The column is free text and holds three shapes, all of them in use:
 *
 *   "0-10kg"   a closed range          → the bands it overlaps
 *   "0-16kg"   a range spanning bands  → small, small-medium AND medium
 *   "17kg+"    an open upper bound     → large, extra large and giant
 *
 * A SET, not a single band, because the spanning ones are real: "Quick
 * Clean (Towel Dry) - Small to Medium" is one price for three bands, and
 * resolving it to just one would hide it from the other two.
 *
 * `null` (no band on the item) means it applies to every size — that is
 * how the de-sheds and nail clipping are stored.
 */
const SIZE_BANDS_ALL: DogSizeBand[] = MEMBERSHIP_WEIGHT_BANDS.map((band) => band.id);

export function bandsFromCatalogueWeightBand(
  weightBand: string | null | undefined,
): DogSizeBand[] {
  if (!weightBand || weightBand.trim() === "") return SIZE_BANDS_ALL;

  const text = weightBand.trim();
  // "11-13kg" before "13kg", or the range reads as its upper figure alone.
  const range = /(\d{1,3})\s*-\s*(\d{1,3})/.exec(text);
  const single = /(\d{1,3})/.exec(text);

  let low: number;
  let high: number;
  if (range) {
    low = Number(range[1]);
    high = Number(range[2]);
  } else if (single) {
    low = Number(single[1]);
    high = low;
  } else {
    return SIZE_BANDS_ALL;
  }

  // "17kg+" and "26kg+" have no ceiling. Without this they collapse to the
  // single band containing that figure and the heavier dogs lose the price.
  if (text.includes("+")) high = Number.POSITIVE_INFINITY;
  // A lone "10kg" is an upper bound in this catalogue ("SML-10kg"), not a
  // dog that weighs exactly 10.
  if (!range && !text.includes("+")) low = 0;

  const covered = MEMBERSHIP_WEIGHT_BANDS.filter(
    (band) => high >= band.minKg && low <= band.maxKg,
  ).map((band) => band.id);

  // A band that parses to nothing — a figure outside every band — is left
  // as no match, so it drops out of the list rather than pricing a dog it
  // does not describe. An unparseable string took the every-size path above.
  return covered;
}

/** The shape this module needs from a `pricing_services` row. */
export type PriceCatalogueItem = {
  id: number;
  name: string;
  legacyServiceType: string | null;
  weightBand: string | null;
  priceMode: string;
  priceAud: string | null;
  sortOrder?: number;
};

export type PriceOption = {
  id: number;
  name: string;
  tier: PriceTier | null;
  priceAud: string | null;
  priceMode: string;
  /** No figure to copy — "Colour / Dye" is quoted per dog. */
  requiresManualPrice: boolean;
  /** This item names this dog's band, rather than applying to every size. */
  bandSpecific: boolean;
};

/**
 * Every catalogue price that could apply to this dog and this service.
 *
 * Returned as a LIST, deliberately. (service, band, tier) is not unique in
 * the real catalogue: a large styled groom has three rows, and a small
 * tidy has two priced by coat length ($100 long hair, $88 short). Picking
 * one silently would quote a long-haired dog as short-haired. Staff see
 * the options and the default is only a default.
 *
 * With no band known — 10,372 of 12,552 dogs have no recorded weight —
 * every priced row for the service comes back, so the dialog can still
 * offer a list instead of an empty box.
 */
export function groomPriceOptions(input: {
  serviceType: ServiceType | string;
  sizeBand: DogSizeBand | null;
  catalogue: readonly PriceCatalogueItem[];
  /**
   * "applicable" (the default) is this dog, this service. "all" is the
   * whole price list, for the cases the bands do not describe — a small
   * dog so matted it is priced as a medium, or a service the salon wants
   * to charge off-label. Staff opt into it with a checkbox; it is not the
   * default because 43 rows is a list nobody reads on every booking.
   */
  scope?: "applicable" | "all";
}): PriceOption[] {
  const matches = input.catalogue.filter((item) => {
    if (input.scope === "all") return true;
    if (item.legacyServiceType !== input.serviceType) return false;
    if (!input.sizeBand) return true;
    return bandsFromCatalogueWeightBand(item.weightBand).includes(input.sizeBand);
  });

  return matches
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
    .map((item) => ({
      id: item.id,
      name: item.name,
      tier: tierFromCatalogueName(item.name),
      priceAud: item.priceAud,
      priceMode: item.priceMode,
      requiresManualPrice: item.priceMode !== "fixed",
      bandSpecific: Boolean(item.weightBand && item.weightBand.trim() !== ""),
    }));
}

/**
 * The option to fill the price box with, or null when nothing fits.
 *
 * Order matters. An exact tier match wins; an untiered item is next,
 * because that is a salon that does not tier its prices at all; and a
 * priced row beats a quote-only one, since a quote leaves the box empty
 * either way and the point here is to stop staff guessing.
 *
 * Never falls back to "some other tier's price". Quoting a first-timer the
 * VIP rate loses the salon $35 a groom and nobody would notice.
 */
export function pickDefaultPriceOption(
  options: readonly PriceOption[],
  tier: PriceTier,
): PriceOption | null {
  const priced = options.filter((option) => !option.requiresManualPrice && option.priceAud !== null);
  const pool = priced.length > 0 ? priced : options;
  if (pool.length === 0) return null;

  // A band-specific row is better evidence than a catch-all: "Tidy - Small"
  // should beat an untiered "Tidy" if a salon ever carries both.
  const byPreference = [
    pool.filter((o) => o.tier === tier && o.bandSpecific),
    pool.filter((o) => o.tier === tier),
    pool.filter((o) => o.tier === null && o.bandSpecific),
    pool.filter((o) => o.tier === null),
  ];
  for (const group of byPreference) {
    if (group.length > 0) return group[0];
  }
  return null;
}

/**
 * The two quick picks the booking dialog puts in front of staff.
 *
 * Andy asked for this split into "Classic Cut" and "Styled Cut" so a new
 * dog can be entered in one tap. It is an affordance, not a prediction —
 * nothing in a dog's weight says whether its owner wants a styled cut, and
 * pretending otherwise would put a confident wrong number on the screen.
 * What the weight DOES settle is the price of each, so both are shown with
 * their figure and the staff member picks.
 */
export type ServiceSuggestion = {
  serviceType: ServiceType;
  label: string;
  /**
   * What the WHOLE booking comes to if this is tapped, or null when any
   * dog on it has no listed price at this client's tier.
   *
   * Null rather than a figure drawn from some other dog's size. The first
   * version showed the cheapest listed price for the service and labelled
   * it "from", which on Kim Dahl's two small dogs read "Styled Cut from
   * $250.00" — $250 being the LARGE regular price, the only styled
   * regular price that exists. Tapping it set both dogs to $0.00, because
   * neither has a regular styled price. The button promised a number the
   * app could not produce.
   */
  total: string | null;
};

export const QUICK_PICK_SERVICES: ReadonlyArray<{ serviceType: ServiceType; label: string }> = [
  { serviceType: "classic_groom", label: "Classic Cut" },
  { serviceType: "styled_groom", label: "Styled Cut" },
];

export function serviceQuickPicks(input: {
  /**
   * One entry per dog on the booking, in order — each with its OWN tier,
   * because a membership belongs to the pet. A household can have a Gold
   * poodle beside an unenrolled schnauzer, and the two are not on the same
   * price list.
   */
  dogs: ReadonlyArray<{ sizeBand: DogSizeBand | null; tier: PriceTier }>;
  catalogue: readonly PriceCatalogueItem[];
}): ServiceSuggestion[] {
  return QUICK_PICK_SERVICES.map(({ serviceType, label }) => {
    const prices = input.dogs.map(({ sizeBand, tier }) =>
      pickDefaultPriceOption(
        groomPriceOptions({ serviceType, sizeBand, catalogue: input.catalogue }),
        tier,
      )?.priceAud ?? null,
    );
    const { total, complete } = bookingTotal(prices);
    return {
      serviceType,
      label,
      total: input.dogs.length > 0 && complete ? total : null,
    };
  });
}

/** "$125.00", or null when there is no figure to show. */
export function formatPriceAud(price: string | number | null | undefined): string | null {
  if (price === null || price === undefined || String(price).trim() === "") return null;
  const value = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(value)) return null;
  return `$${value.toFixed(2)}`;
}

/**
 * What the whole booking comes to, and whether any dog is still unpriced.
 *
 * The dialog shows this the way MoeGo does — a figure per dog and an
 * estimated total underneath. `complete` is false while any dog has no
 * price, so the total is never presented as final when one dog's figure is
 * missing; that is the state the old single box left behind.
 */
export function bookingTotal(
  prices: ReadonlyArray<string | number | null | undefined>,
  /**
   * Every extra on the booking, across all dogs.
   *
   * Omitting these is how the dialog showed "Total $145.00" above three
   * add-ons worth $180 — the figure staff read out to the client was short
   * by the whole of the extras. Andy, 13/10/2026: "the price needs to auto
   * calculate when adding in those extras so the total shows the true and
   * correct total value."
   *
   * They never affect `complete`. An extra always carries a figure — a
   * quote-priced one cannot be added without typing the agreed amount —
   * so it can add to the total but can never make the booking unpriced.
   * A membership groom is $0.00 and its extras are still charged, which
   * falls out of this correctly.
   */
  extras: ReadonlyArray<string | number | null | undefined> = [],
): { total: string; complete: boolean } {
  let cents = 0;
  let complete = true;
  for (const extra of extras) {
    if (extra === null || extra === undefined || String(extra).trim() === "") continue;
    const value = typeof extra === "number" ? extra : Number(extra);
    if (Number.isFinite(value)) cents += Math.round(value * 100);
  }
  for (const price of prices) {
    if (price === null || price === undefined || String(price).trim() === "") {
      complete = false;
      continue;
    }
    const value = typeof price === "number" ? price : Number(price);
    if (!Number.isFinite(value)) {
      complete = false;
      continue;
    }
    cents += Math.round(value * 100);
  }
  return { total: (cents / 100).toFixed(2), complete };
}
