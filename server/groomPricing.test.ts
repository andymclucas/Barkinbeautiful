import { describe, it, expect } from "vitest";
import {
  bandsFromCatalogueWeightBand,
  tierFromCatalogueName,
  clientPriceTier,
  groomPriceOptions,
  pickDefaultPriceOption,
  serviceQuickPicks,
  bookingTotal,
  formatPriceAud,
  type PriceCatalogueItem,
  MEMBERSHIP_PRICE_TIERS,
} from "@shared/groomPricing";

/**
 * The real catalogue, as it stands in production on 13/10/2026.
 *
 * Copied from `pricing_services` rather than invented, because the whole
 * difficulty here is the shapes the live data actually holds — three price
 * tiers written into the name, weight bands as free text, open-ended bands
 * like "17kg+", and two rows for the same service and size that differ
 * only by coat length. A tidy fixture would pass and tell us nothing.
 */
const CATALOGUE: PriceCatalogueItem[] = [
  { id: 1, name: "Bath & Blow-dry - Small", legacyServiceType: "bath_only", weightBand: "0-10kg", priceMode: "fixed", priceAud: "60.00", sortOrder: 1 },
  { id: 2, name: "Bath & Blow-dry - Medium", legacyServiceType: "bath_only", weightBand: "14-16kg", priceMode: "fixed", priceAud: "70.00", sortOrder: 2 },
  { id: 5, name: "Quick Clean (Towel Dry) - Small to Medium", legacyServiceType: "bath_only", weightBand: "0-16kg", priceMode: "fixed", priceAud: "50.00", sortOrder: 5 },
  { id: 6, name: "Quick Clean (Towel Dry) - Large, short hair", legacyServiceType: "bath_only", weightBand: "17kg+", priceMode: "fixed", priceAud: "55.00", sortOrder: 6 },
  { id: 7, name: "Quick Clean (Towel Dry) - Large, long hair", legacyServiceType: "bath_only", weightBand: "17kg+", priceMode: "fixed", priceAud: "70.00", sortOrder: 7 },

  { id: 10, name: "Full Groom (Classic) - New Client - Small", legacyServiceType: "classic_groom", weightBand: "0-10kg", priceMode: "fixed", priceAud: "145.00", sortOrder: 10 },
  { id: 11, name: "Full Groom (Classic) - New Client - Small-Medium", legacyServiceType: "classic_groom", weightBand: "11-13kg", priceMode: "fixed", priceAud: "163.00", sortOrder: 11 },
  { id: 15, name: "Full Groom (Classic) - Regular Client - Small", legacyServiceType: "classic_groom", weightBand: "0-10kg", priceMode: "fixed", priceAud: "125.00", sortOrder: 15 },
  { id: 16, name: "Full Groom (Classic) - Regular Client - Small-Medium", legacyServiceType: "classic_groom", weightBand: "11-13kg", priceMode: "fixed", priceAud: "162.50", sortOrder: 16 },
  { id: 20, name: "Full Groom (Classic) - VIP Client - Small", legacyServiceType: "classic_groom", weightBand: "0-10kg", priceMode: "fixed", priceAud: "110.00", sortOrder: 20 },
  { id: 25, name: "Full Groom (Classic) - VIP Client - Giant", legacyServiceType: "classic_groom", weightBand: "36-80kg", priceMode: "fixed", priceAud: "290.00", sortOrder: 25 },

  { id: 30, name: "Full Groom (Styled) - New Client - Small", legacyServiceType: "styled_groom", weightBand: "0-10kg", priceMode: "fixed", priceAud: "163.00", sortOrder: 30 },
  { id: 31, name: "Full Groom (Styled) - VIP Client - Small", legacyServiceType: "styled_groom", weightBand: "0-10kg", priceMode: "fixed", priceAud: "145.00", sortOrder: 31 },

  { id: 40, name: "Tidy (Face, Feet & Hygiene) - Small", legacyServiceType: "fft", weightBand: "0-10kg", priceMode: "fixed", priceAud: "100.00", sortOrder: 40 },
  { id: 41, name: "Tidy - Small, short hair", legacyServiceType: "fft", weightBand: "0-10kg", priceMode: "fixed", priceAud: "88.00", sortOrder: 41 },

  { id: 50, name: "Nail Clipping", legacyServiceType: "nail_trim", weightBand: null, priceMode: "fixed", priceAud: "25.00", sortOrder: 50 },
  { id: 51, name: "De-shed - 1 hour, small dog or shorter double coat", legacyServiceType: "deshed", weightBand: null, priceMode: "fixed", priceAud: "120.00", sortOrder: 51 },
];

describe("bandsFromCatalogueWeightBand", () => {
  it("reads a closed range as the bands it covers", () => {
    expect(bandsFromCatalogueWeightBand("0-10kg")).toEqual(["small"]);
    expect(bandsFromCatalogueWeightBand("11-13kg")).toEqual(["small_medium"]);
    expect(bandsFromCatalogueWeightBand("14-16kg")).toEqual(["medium"]);
    expect(bandsFromCatalogueWeightBand("17-25kg")).toEqual(["large"]);
    expect(bandsFromCatalogueWeightBand("26-34kg")).toEqual(["extra_large"]);
    expect(bandsFromCatalogueWeightBand("36-80kg")).toEqual(["giant"]);
  });

  it("spans every band a wide range touches", () => {
    // "Quick Clean - Small to Medium" is one price for three bands. Resolving
    // it to a single band would hide it from the other two.
    expect(bandsFromCatalogueWeightBand("0-16kg")).toEqual(["small", "small_medium", "medium"]);
  });

  it("treats a trailing + as having no ceiling", () => {
    expect(bandsFromCatalogueWeightBand("17kg+")).toEqual(["large", "extra_large", "giant"]);
    expect(bandsFromCatalogueWeightBand("26kg+")).toEqual(["extra_large", "giant"]);
  });

  it("applies an item with no band to every size", () => {
    // Nail clipping and the de-sheds are stored this way.
    expect(bandsFromCatalogueWeightBand(null)).toHaveLength(6);
    expect(bandsFromCatalogueWeightBand("")).toHaveLength(6);
    expect(bandsFromCatalogueWeightBand("   ")).toHaveLength(6);
  });

  it("reads a lone figure as an upper bound, the way the salon writes it", () => {
    // "SML-10kg" means up to 10 kg, not a dog weighing exactly 10.
    expect(bandsFromCatalogueWeightBand("10kg")).toEqual(["small"]);
  });

  it("falls back to every size rather than hiding an unparseable band", () => {
    // Showing one option too many is recoverable; silently dropping the only
    // price for a service leaves staff back at an empty box.
    expect(bandsFromCatalogueWeightBand("small-ish")).toHaveLength(6);
  });
});

describe("tierFromCatalogueName", () => {
  it("reads the three tiers the salon writes into its names", () => {
    expect(tierFromCatalogueName("Full Groom (Classic) - New Client - Small")).toBe("new");
    expect(tierFromCatalogueName("Full Groom (Classic) - Regular Client - Small")).toBe("regular");
    expect(tierFromCatalogueName("Full Groom (Classic) - VIP Client - Small")).toBe("vip");
  });

  it("returns null for an item that names no tier", () => {
    expect(tierFromCatalogueName("Nail Clipping")).toBeNull();
    expect(tierFromCatalogueName(null)).toBeNull();
  });

  it("matches the whole phrase, not a bare adjective", () => {
    // A salon with "Puppy's First Groom" must not be read as a new-client rate.
    expect(tierFromCatalogueName("Puppy's First Groom - New Puppy Package")).toBeNull();
  });
});

describe("clientPriceTier", () => {
  it("quotes a non-member the casual rate", () => {
    // Andy, 13/10/2026: "Only actual members get Bronze, everyone else
    // pays Casual." This used to key on whether the household had been
    // here before, which made 703 of 963 upcoming bookings a members'
    // rate — about $20 a dog under the casual price.
    expect(clientPriceTier({})).toBe("new");
    expect(clientPriceTier({ membershipTier: null })).toBe("new");
    expect(clientPriceTier({ membershipTier: "" })).toBe("new");
    expect(clientPriceTier({ membershipTier: "   " })).toBe("new");
  });

  it("quotes a Bronze member the Bronze rate", () => {
    expect(clientPriceTier({ membershipTier: "bronze" })).toBe("regular");
    expect(clientPriceTier({ membershipTier: "Bronze" })).toBe("regular");
    expect(clientPriceTier({ membershipTier: " BRONZE " })).toBe("regular");
  });

  it("puts every shorter interval on the Diamond-Gold rate", () => {
    // MoeGo's label is "Diamond - Gold (up to 6wks)". Silver's interval is
    // exactly 6 weeks so it belongs inside that band, and silver is the
    // biggest group of them — 124 of the upcoming membership bookings.
    for (const tier of ["diamond", "platinum", "gold", "silver"]) {
      expect(clientPriceTier({ membershipTier: tier })).toBe("vip");
    }
  });

  it("treats an unrecognised tier as a member rather than a casual", () => {
    // A tier this code has not heard of is still somebody paying weekly.
    // Quoting them the casual rate would charge a member the dearest
    // price; the members' rate is the safer side of an unknown.
    expect(clientPriceTier({ membershipTier: "titanium" })).toBe("vip");
  });
});

describe("groomPriceOptions", () => {
  it("returns every tier for the dog's own band", () => {
    const options = groomPriceOptions({ serviceType: "classic_groom", sizeBand: "small", catalogue: CATALOGUE });
    expect(options.map((o) => o.priceAud)).toEqual(["145.00", "125.00", "110.00"]);
    expect(options.map((o) => o.tier)).toEqual(["new", "regular", "vip"]);
  });

  it("excludes bands the dog is not in", () => {
    const options = groomPriceOptions({ serviceType: "classic_groom", sizeBand: "giant", catalogue: CATALOGUE });
    expect(options).toHaveLength(1);
    expect(options[0].priceAud).toBe("290.00");
  });

  it("keeps both coat-length rows for the same service and size", () => {
    // $100 long hair and $88 short hair are the same band. Picking one
    // silently would quote a long-haired dog as short-haired.
    const options = groomPriceOptions({ serviceType: "fft", sizeBand: "small", catalogue: CATALOGUE });
    expect(options.map((o) => o.priceAud)).toEqual(["100.00", "88.00"]);
  });

  it("includes an untiered, bandless item for any size", () => {
    const small = groomPriceOptions({ serviceType: "nail_trim", sizeBand: "small", catalogue: CATALOGUE });
    const giant = groomPriceOptions({ serviceType: "nail_trim", sizeBand: "giant", catalogue: CATALOGUE });
    expect(small.map((o) => o.id)).toEqual([50]);
    expect(giant.map((o) => o.id)).toEqual([50]);
  });

  it("returns every priced row for the service when the dog has no band", () => {
    // 10,372 of 12,552 dogs have no recorded weight. An empty list here is
    // the empty price box this whole module exists to remove.
    const options = groomPriceOptions({ serviceType: "classic_groom", sizeBand: null, catalogue: CATALOGUE });
    expect(options.length).toBe(6);
  });

  it("matches an open-ended band for every size above its floor", () => {
    for (const band of ["large", "extra_large", "giant"] as const) {
      const options = groomPriceOptions({ serviceType: "bath_only", sizeBand: band, catalogue: CATALOGUE });
      expect(options.map((o) => o.id)).toContain(6);
    }
    const small = groomPriceOptions({ serviceType: "bath_only", sizeBand: "small", catalogue: CATALOGUE });
    expect(small.map((o) => o.id)).not.toContain(6);
  });

  it("returns nothing for a service the catalogue does not price", () => {
    expect(groomPriceOptions({ serviceType: "daycare", sizeBand: "small", catalogue: CATALOGUE })).toEqual([]);
  });
});

describe("pickDefaultPriceOption", () => {
  const smallClassic = groomPriceOptions({ serviceType: "classic_groom", sizeBand: "small", catalogue: CATALOGUE });

  it("fills a first-timer's box with the new-client price", () => {
    expect(pickDefaultPriceOption(smallClassic, "new")?.priceAud).toBe("145.00");
  });

  it("fills a returning client's box with the regular price", () => {
    expect(pickDefaultPriceOption(smallClassic, "regular")?.priceAud).toBe("125.00");
  });

  it("never substitutes another tier's price when the asked-for tier is missing", () => {
    // Only a VIP giant classic exists. A regular client booking a giant must
    // not be quietly quoted the members' rate.
    const giant = groomPriceOptions({ serviceType: "classic_groom", sizeBand: "giant", catalogue: CATALOGUE });
    expect(pickDefaultPriceOption(giant, "regular")).toBeNull();
  });

  it("uses an untiered item when the catalogue has no tiers at all", () => {
    // A second salon that does not price by tier gets one price per service.
    const nails = groomPriceOptions({ serviceType: "nail_trim", sizeBand: "small", catalogue: CATALOGUE });
    expect(pickDefaultPriceOption(nails, "new")?.priceAud).toBe("25.00");
    expect(pickDefaultPriceOption(nails, "regular")?.priceAud).toBe("25.00");
  });

  it("prefers a priced row over a quote-only one", () => {
    const options = groomPriceOptions({
      serviceType: "classic_groom",
      sizeBand: "small",
      catalogue: [
        { id: 90, name: "Full Groom (Classic) - New Client - Small", legacyServiceType: "classic_groom", weightBand: "0-10kg", priceMode: "quote", priceAud: null, sortOrder: 1 },
        { id: 91, name: "Full Groom (Classic) - Bespoke", legacyServiceType: "classic_groom", weightBand: "0-10kg", priceMode: "fixed", priceAud: "140.00", sortOrder: 2 },
      ],
    });
    expect(pickDefaultPriceOption(options, "new")?.priceAud).toBe("140.00");
  });

  it("returns null rather than inventing a price for an empty list", () => {
    expect(pickDefaultPriceOption([], "regular")).toBeNull();
  });
});

describe("serviceQuickPicks", () => {
  const dog = (sizeBand: any, tier: any = "new") => ({ sizeBand, tier });

  it("shows what the booking total becomes, not one dog's price", () => {
    const picks = serviceQuickPicks({
      dogs: [dog("small", "regular"), dog("small_medium", "regular")],
      catalogue: CATALOGUE,
    });
    expect(picks.map((p) => p.label)).toEqual(["Classic Cut", "Styled Cut"]);
    expect(picks[0].total).toBe("287.50");
  });

  it("prices each dog on its OWN membership", () => {
    // A household can have a Bronze poodle beside an unenrolled one. The
    // total is $125 (Bronze small) + $145 (casual small) = $270.
    const picks = serviceQuickPicks({
      dogs: [dog("small", "regular"), dog("small", "new")],
      catalogue: CATALOGUE,
    });
    expect(picks[0].total).toBe("270.00");
  });

  it("is exact for a single dog", () => {
    expect(serviceQuickPicks({ dogs: [dog("small", "new")], catalogue: CATALOGUE })[0].total).toBe("145.00");
    expect(serviceQuickPicks({ dogs: [dog("small", "regular")], catalogue: CATALOGUE })[0].total).toBe("125.00");
    expect(serviceQuickPicks({ dogs: [dog("small", "vip")], catalogue: CATALOGUE })[0].total).toBe("110.00");
  });

  it("shows no figure when any dog has no listed price at its tier", () => {
    // The bug this replaced read "Styled Cut from $250.00" on two small
    // dogs — $250 being the LARGE regular price — and set both to $0.00.
    const picks = serviceQuickPicks({
      dogs: [dog("small", "regular"), dog("small_medium", "regular")],
      catalogue: CATALOGUE,
    });
    expect(picks[1].serviceType).toBe("styled_groom");
    expect(picks[1].total).toBeNull();
  });

  it("shows no figure when one dog of several is unpriced", () => {
    const picks = serviceQuickPicks({
      dogs: [dog("small", "regular"), dog("giant", "regular")],
      catalogue: CATALOGUE,
    });
    expect(picks[0].total).toBeNull();
  });

  it("offers both services even when neither can be priced", () => {
    const picks = serviceQuickPicks({ dogs: [dog("giant", "regular")], catalogue: CATALOGUE });
    expect(picks).toHaveLength(2);
    expect(picks.every((p) => p.total === null)).toBe(true);
  });

  it("shows no figure before any dog is chosen", () => {
    expect(serviceQuickPicks({ dogs: [], catalogue: CATALOGUE }).every((p) => p.total === null)).toBe(true);
  });
});

describe("bookingTotal", () => {
  it("adds the dogs up without floating-point dust", () => {
    // 163.00 + 125.00 is the booking in Lauren's screenshot: $288.00.
    expect(bookingTotal(["163.00", "125.00"])).toEqual({ total: "288.00", complete: true });
  });

  it("sums in cents so repeated decimals do not drift", () => {
    expect(bookingTotal(["0.10", "0.20"]).total).toBe("0.30");
    expect(bookingTotal(["162.50", "162.50", "162.50"]).total).toBe("487.50");
  });

  it("marks the total incomplete while any dog is unpriced", () => {
    // This is the state the single price box left behind on 80 appointments:
    // one dog carrying the family's fee and its siblings NULL.
    expect(bookingTotal(["163.00", null])).toEqual({ total: "163.00", complete: false });
    expect(bookingTotal(["163.00", ""])).toEqual({ total: "163.00", complete: false });
  });

  it("treats an unreadable price as missing rather than as zero", () => {
    expect(bookingTotal(["163.00", "abc"])).toEqual({ total: "163.00", complete: false });
  });

  it("counts an explicit zero as priced", () => {
    // A membership groom is $0.00 on purpose, and the total must not report
    // it as something nobody has got round to filling in.
    expect(bookingTotal(["0.00", "35.00"])).toEqual({ total: "35.00", complete: true });
  });

  it("is complete and zero for no dogs at all", () => {
    expect(bookingTotal([])).toEqual({ total: "0.00", complete: true });
  });

  it("counts the extras", () => {
    // The dialog showed "Total $145.00" above three add-ons worth $180.
    // The figure staff read out to the client was short by the whole of
    // the extras. Teddy: $145 groom + $35 + $65 + $80 = $325.
    expect(bookingTotal(["145.00"], ["35.00", "65.00", "80.00"]))
      .toEqual({ total: "325.00", complete: true });
  });

  it("counts extras across several dogs", () => {
    expect(bookingTotal(["125.00", "162.50"], ["35.00"]))
      .toEqual({ total: "322.50", complete: true });
  });

  it("charges extras on a membership groom", () => {
    // The weekly payment covers the cut, not the de-matt done on the day.
    expect(bookingTotal(["0.00", "0.00"], ["35.00"]))
      .toEqual({ total: "35.00", complete: true });
  });

  it("never lets an extra make the booking look priced", () => {
    // A dog with no price is still unpriced, however many extras it has —
    // otherwise the panel would show a total as if it were settled.
    expect(bookingTotal([null], ["35.00"]))
      .toEqual({ total: "35.00", complete: false });
  });

  it("sums extras in cents too", () => {
    expect(bookingTotal(["0.10"], ["0.20"]).total).toBe("0.30");
  });

  it("ignores an unreadable extra rather than counting it as zero-ish", () => {
    expect(bookingTotal(["145.00"], ["abc", "35.00"]).total).toBe("180.00");
  });
});

describe("formatPriceAud", () => {
  it("formats a decimal string the way the dialog shows it", () => {
    expect(formatPriceAud("125")).toBe("$125.00");
    expect(formatPriceAud("162.5")).toBe("$162.50");
    expect(formatPriceAud(0)).toBe("$0.00");
  });

  it("returns null when there is nothing to show", () => {
    expect(formatPriceAud(null)).toBeNull();
    expect(formatPriceAud("")).toBeNull();
    expect(formatPriceAud("quote")).toBeNull();
  });
});

describe('groomPriceOptions scope: "all"', () => {
  it("shows the whole price list, whatever the dog or the service", () => {
    // The escape hatch behind "Only show applicable services": a small dog
    // so matted it is charged as a medium, or a service priced off-label.
    const all = groomPriceOptions({ serviceType: "classic_groom", sizeBand: "small", catalogue: CATALOGUE, scope: "all" });
    expect(all).toHaveLength(CATALOGUE.length);
    expect(all.map((o) => o.id)).toContain(50); // nail clipping, a different service
    expect(all.map((o) => o.id)).toContain(25); // a giant's price, a different band
  });

  it("still carries tiers and prices through", () => {
    const all = groomPriceOptions({ serviceType: "fft", sizeBand: "giant", catalogue: CATALOGUE, scope: "all" });
    const regularSmallClassic = all.find((o) => o.id === 15);
    expect(regularSmallClassic?.tier).toBe("regular");
    expect(regularSmallClassic?.priceAud).toBe("125.00");
  });

  it("defaults to applicable when no scope is given", () => {
    const withoutScope = groomPriceOptions({ serviceType: "classic_groom", sizeBand: "small", catalogue: CATALOGUE });
    const explicit = groomPriceOptions({ serviceType: "classic_groom", sizeBand: "small", catalogue: CATALOGUE, scope: "applicable" });
    expect(withoutScope).toEqual(explicit);
    expect(withoutScope.length).toBeLessThan(CATALOGUE.length);
  });
});

describe("the membership tier ladder", () => {
  it("prices every tier the salon actually uses", () => {
    // All five enum values are in use: 88 silver, 31 gold, 26 bronze,
    // 5 diamond, 3 platinum on 14/10/2026. None may fall through.
    for (const tier of ["diamond", "platinum", "gold", "silver", "bronze"]) {
      expect(MEMBERSHIP_PRICE_TIERS[tier]).toBeDefined();
    }
  });

  it("keeps bronze on the regular rate", () => {
    // MoeGo's "Bronze (8wks)" is Groomigo's Regular Client.
    expect(clientPriceTier({ membershipTier: "bronze" })).toBe("regular");
  });

  it("keeps diamond, platinum and gold on VIP", () => {
    // MoeGo's "Diamond - Gold (up to 6wks)".
    for (const tier of ["diamond", "platinum", "gold"]) {
      expect(clientPriceTier({ membershipTier: tier })).toBe("vip");
    }
  });

  it("treats no membership as a new client", () => {
    expect(clientPriceTier({ membershipTier: "" })).toBe("new");
    expect(clientPriceTier({ membershipTier: null })).toBe("new");
    expect(clientPriceTier({})).toBe("new");
  });

  it("keeps an unmapped tier on the members' rate", () => {
    // Deliberate, and older than this map: holding a tier value at all
    // means the client IS a paying member, so the casual rate would charge
    // a member the dearest price in the book. Pinned by its own test
    // above, which caught an attempt to reverse it on 14/10/2026.
    expect(clientPriceTier({ membershipTier: "titanium" })).toBe("vip");
  });

  it("lets a salon choose where its own unmapped tiers land", () => {
    expect(clientPriceTier({ membershipTier: "titanium", unmapped: "new" })).toBe("new");
  });

  it("lets another salon bring its own ladder", () => {
    // The map is policy, not a fact. A second salon's silver may be its
    // regular rate; inheriting this one's would be a pricing decision
    // nobody made.
    const policy = { silver: "regular" as const, gold: "vip" as const };
    expect(clientPriceTier({ membershipTier: "silver", policy })).toBe("regular");
    expect(clientPriceTier({ membershipTier: "gold", policy })).toBe("vip");
    // A tier absent from THEIR policy takes the unmapped fallback, not
    // this salon's mapping for it.
    expect(clientPriceTier({ membershipTier: "bronze", policy })).toBe("vip");
  });

  it("is forgiving about case and padding", () => {
    expect(clientPriceTier({ membershipTier: "  BRONZE " })).toBe("regular");
  });
});
