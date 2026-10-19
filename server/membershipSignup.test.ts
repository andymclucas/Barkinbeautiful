import { describe, it, expect } from "vitest";
import {
  MAX_SIGNUP_DOGS,
  quoteMembershipSignup,
  signupPackagesForWeight,
  weightForQuote,
  type SignupDogInput,
} from "@shared/membershipSignup";
import { MEMBERSHIP_PACKAGES, getMembershipPackageById } from "@shared/membershipPackages";
import type { MembershipPlanRow } from "@shared/membershipAssignable";

/** Lauren's five-weekly styled plan — the one the built-in ladder cannot express. */
const SILVER_PLUS: MembershipPlanRow = {
  id: 7, name: "Silver +", tier: "silver", serviceVariant: "styled",
  weightBand: null, weeklyPriceAud: "48.00", appointmentIntervalWeeks: 5, isActive: true,
};

const quote = (dogs: SignupDogInput[], plans: MembershipPlanRow[] = []) =>
  quoteMembershipSignup({ dogs, builtIns: MEMBERSHIP_PACKAGES, plans });

/** A 12 kg dog on a 4-weekly gold classic. */
const bailey: SignupDogInput = { name: "Bailey", weightKg: 12, packageId: "gold-classic-small_medium" };
/** A 20 kg dog, different band, same 4-weekly cadence. */
const maisie: SignupDogInput = { name: "Maisie", weightKg: 20, packageId: "gold-classic-large" };

describe("quoteMembershipSignup", () => {
  it("prices two dogs from the catalogue and shares one visit interval", () => {
    const result = quote([bailey, maisie]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.intervalWeeks).toBe(4);
    expect(result.lines.map((l) => [l.petName, l.weeklyPrice])).toEqual([["Bailey", 26], ["Maisie", 35]]);
    expect(result.weeklyTotal).toBe(61);
    expect(result.visitsPerYear).toBe("13 grooms a year");
  });

  it("takes the price from the catalogue, so the dog's band decides it", () => {
    // Same package id would be meaningless for a dog in another band; the
    // line price must match the catalogue row, not anything posted.
    const result = quote([maisie]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines[0].weeklyPrice).toBe(getMembershipPackageById("gold-classic-large")!.weeklyPrice);
  });

  it("refuses a package the dog's weight does not qualify for", () => {
    // A 42 kg Giant picking the Small band's membership is the whole reason
    // the chosen package is re-resolved against the weight server-side.
    const result = quote([{ name: "Link", weightKg: 42, packageId: "gold-classic-small" }]);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.problems[0]).toContain("cannot be put on that membership at 42 kg");
  });

  it("offers a salon's own five-weekly plan, whatever the dog weighs", () => {
    // Julie Noy's case: an interval the five built-in tiers do not have.
    const result = quote([{ name: "Rosie", weightKg: 19, packageId: "plan:7" }], [SILVER_PLUS]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.intervalWeeks).toBe(5);
    expect(result.weeklyTotal).toBe(48);
    expect(result.visitsPerYear).toBe("10 grooms a year");
    expect(result.lines[0]).toMatchObject({ packageName: "Silver +", custom: true, tier: "silver" });
  });

  it("will not mix visit frequencies in one household", () => {
    // 4-weekly and 6-weekly dogs share a date four times a year and need a
    // separate trip for every other groom.
    const result = quote([bailey, { name: "Teddy", weightKg: 20, packageId: "silver-classic-large" }]);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.problems[0]).toContain("same visit frequency");
    expect(result.problems[0]).toContain("4-weekly and 6-weekly");
  });

  it("refuses a weight that falls between the bands", () => {
    // The bands stop at 34 and restart at 36. A 35 kg dog has no price,
    // and rounding to the nearest band bills a rate nobody agreed.
    const result = quote([{ name: "Bruno", weightKg: 35, packageId: "gold-classic-giant" }]);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.problems[0]).toContain("do not have a membership price");
  });

  it("rejects a weight outside the bands entirely", () => {
    expect(quote([{ ...bailey, weightKg: 0 }])).toMatchObject({ ok: false });
    expect(quote([{ ...bailey, weightKg: 120 }])).toMatchObject({ ok: false });
    expect(quote([{ ...bailey, weightKg: Number.NaN }])).toMatchObject({ ok: false });
  });

  it("catches the same dog added twice", () => {
    const result = quote([bailey, { ...bailey }]);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.problems[0]).toContain("two dogs called Bailey");
  });

  it("needs a name for every dog", () => {
    expect(quote([{ ...bailey, name: "   " }])).toMatchObject({ ok: false });
  });

  it("holds the line at a household", () => {
    const pack = Array.from({ length: MAX_SIGNUP_DOGS + 1 }, (_, i) => ({ ...bailey, name: `Dog ${i}` }));
    const result = quote(pack);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.problems[0]).toContain(`${MAX_SIGNUP_DOGS} dogs`);
  });

  it("refuses an empty sign-up", () => {
    expect(quote([])).toMatchObject({ ok: false, problems: ["Add at least one dog."] });
  });

  it("totals in cents, so the weekly charge is not a floating-point artefact", () => {
    // 3 x $26 is the kind of sum that lands on 77.99999999999999 when the
    // dollars are added as floats, and this figure becomes a Stripe charge.
    const result = quote([
      { ...bailey, name: "A" }, { ...bailey, name: "B" }, { ...bailey, name: "C" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weeklyTotal).toBe(78);
    expect(Number.isInteger(Math.round(result.weeklyTotal * 100))).toBe(true);
  });

  it("reports every problem at once rather than one per attempt", () => {
    const result = quote([
      { name: "", weightKg: 12, packageId: "gold-classic-small_medium" },
      { name: "Bruno", weightKg: 35, packageId: "gold-classic-giant" },
    ]);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.problems).toHaveLength(2);
  });
});

describe("signupPackagesForWeight", () => {
  it("offers only what the dog's band can have", () => {
    const offered = signupPackagesForWeight(12, MEMBERSHIP_PACKAGES, []);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((p) => p.weightClass === "small_medium" || p.weightClass === null)).toBe(true);
  });

  it("puts the salon's own plans first", () => {
    const offered = signupPackagesForWeight(19, MEMBERSHIP_PACKAGES, [SILVER_PLUS]);
    expect(offered[0]).toMatchObject({ id: "plan:7", custom: true });
  });

  it("leaves out a plan no membership row could store", () => {
    // memberships.tier is an enum. A plan whose tier is not one of the five
    // cannot be assigned, so offering it sells something unfulfillable.
    const offered = signupPackagesForWeight(19, MEMBERSHIP_PACKAGES, [
      { ...SILVER_PLUS, id: 8, name: "Unicorn", tier: "unicorn" },
    ]);
    expect(offered.some((p) => p.id === "plan:8")).toBe(false);
  });

  it("offers nothing for a weight with no band", () => {
    expect(signupPackagesForWeight(35, MEMBERSHIP_PACKAGES, [])).toEqual([]);
  });
});

describe("weightForQuote", () => {
  it("prices from the record whenever there is one", () => {
    // A client does not get to set their own dog's weight class. Rosie is
    // on file at 9kg; somebody types 20; she is still priced at 9.
    expect(weightForQuote(20, 9)).toEqual({ weightKg: 9, source: "record" });
    expect(weightForQuote(20, "9.00")).toEqual({ weightKg: 9, source: "record" });
  });

  it("uses the typed weight only for a dog with nothing on file", () => {
    // 10,372 of 12,552 dogs have no weight, so this is the normal path
    // for a new client, not an edge case.
    for (const recorded of [null, undefined, "", "   "]) {
      expect(weightForQuote(14, recorded as any)).toEqual({ weightKg: 14, source: "entered" });
    }
  });

  it("treats a zero or unreadable record as absent, not as 0kg", () => {
    // Priced at 0kg a dog falls in no band at all and the sign-up dies
    // with a message about calling the salon, for a weight nobody typed.
    for (const recorded of [0, "0.00", -5, "heavy", Number.NaN]) {
      expect(weightForQuote(14, recorded as any)).toEqual({ weightKg: 14, source: "entered" });
    }
  });

  it("says where the number came from, so the difference can be shown", () => {
    // The approval card names it when the form and the record disagree.
    expect(weightForQuote(20, 9).source).toBe("record");
    expect(weightForQuote(20, null).source).toBe("entered");
  });
});
