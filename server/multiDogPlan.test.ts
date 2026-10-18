import { describe, it, expect } from "vitest";
import { coversPetsFor, fromPlan, nameLooksMultiDog, type MembershipPlanRow } from "@shared/membershipAssignable";
import { quoteMembershipSignup } from "@shared/membershipSignup";
import { MEMBERSHIP_PACKAGES } from "@shared/membershipPackages";

/** Lauren's real plan: $58 a week covering two small dogs, five-weekly. */
const SILVER_PLUS_X2: MembershipPlanRow = {
  id: 60001, name: "Silver+ (x2)", tier: "silver", serviceVariant: "styled",
  weightBand: "small", weeklyPriceAud: "58.00", appointmentIntervalWeeks: 5,
  coversPets: 2, isActive: true,
};

const quote = (dogs: any[], plans: MembershipPlanRow[] = [SILVER_PLUS_X2]) =>
  quoteMembershipSignup({ dogs, builtIns: MEMBERSHIP_PACKAGES, plans });

const dog = (name: string) => ({ name, weightKg: 8, packageId: "plan:60001" });

describe("coversPetsFor", () => {
  it("reads the column and defaults to one", () => {
    expect(coversPetsFor({ coversPets: 2 })).toBe(2);
    expect(coversPetsFor({ coversPets: 1 })).toBe(1);
    expect(coversPetsFor({ coversPets: null })).toBe(1);
    expect(coversPetsFor({ coversPets: undefined })).toBe(1);
  });

  it("refuses nonsense rather than letting it reach a price", () => {
    expect(coversPetsFor({ coversPets: 0 })).toBe(1);
    expect(coversPetsFor({ coversPets: -3 })).toBe(1);
    expect(coversPetsFor({ coversPets: 1.5 as any })).toBe(1);
  });

  it("is what fromPlan carries through", () => {
    expect(fromPlan(SILVER_PLUS_X2).coversPets).toBe(2);
    expect(fromPlan({ ...SILVER_PLUS_X2, coversPets: null }).coversPets).toBe(1);
  });
});

describe("nameLooksMultiDog", () => {
  it("spots every way the salon writes it", () => {
    // All taken from live membership names.
    for (const name of [
      "Silver VIP Classic - Small (0-10kg) X2",
      "Diamond VIP - SML (0-10kg) x2",
      "Gold VIP Styled - SML (0-10kg) X2 dogs",
      "Bronze VIP Classic - 2 x SML (0-10kg)",
      "Silver+ (x2)",
      "Gold VIP Classic - SML-MED (11-13kg) x2",
    ]) {
      expect(nameLooksMultiDog(name), name).toBe(true);
    }
  });

  it("does not fire on an ordinary plan name", () => {
    // "Extra Large" contains an x with a letter before it, which is the
    // obvious way a looser pattern would go wrong.
    for (const name of [
      "Silver VIP Classic - Small (0-10kg)",
      "Bronze VIP Styled - Extra Large (26-34kg)",
      "Gold VIP Classic - Giant (36-80 kg)",
      "Platinum VIP - Medium (14–16 kg)",
      "Silver+",
    ]) {
      expect(nameLooksMultiDog(name), name).toBe(false);
    }
  });
});

describe("a plan priced for two dogs", () => {
  it("is charged ONCE, not once per dog", () => {
    // The trap: summing per dog quotes $116 for a membership that costs
    // $58 and already covers both.
    const result = quote([dog("Rosie"), dog("Teddy")]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weeklyTotal).toBe(58);
    expect(result.lines).toHaveLength(2);
    expect(result.intervalWeeks).toBe(5);
  });

  it("refuses the wrong number of dogs rather than guessing", () => {
    const one = quote([dog("Rosie")]);
    expect(one).toMatchObject({ ok: false });
    if (one.ok) return;
    expect(one.problems[0]).toContain("is for 2 dogs and you have 1");

    const three = quote([dog("Rosie"), dog("Teddy"), dog("Bluey")]);
    expect(three).toMatchObject({ ok: false });
    if (three.ok) return;
    expect(three.problems[0]).toContain("and you have 3");
  });

  it("will not let one dog be on it and another on something else", () => {
    // Deliberately another FIVE-weekly plan, so the shared-frequency
    // rule is satisfied and the multi-dog rule is what has to catch it.
    const soloFiveWeekly: MembershipPlanRow = {
      id: 60002, name: "Silver+ solo", tier: "silver", serviceVariant: "styled",
      weightBand: "small", weeklyPriceAud: "29.00", appointmentIntervalWeeks: 5,
      coversPets: 1, isActive: true,
    };
    const mixed = quote(
      [dog("Rosie"), { name: "Teddy", weightKg: 8, packageId: "plan:60002" }],
      [SILVER_PLUS_X2, soloFiveWeekly],
    );
    expect(mixed).toMatchObject({ ok: false });
    if (mixed.ok) return;
    expect(mixed.problems[0]).toContain("covers all your dogs together");
  });

  it("still refuses a mix that also disagrees on frequency", () => {
    // Belt and braces: whichever rule fires first, it does not price it.
    const mixed = quote([
      dog("Rosie"),
      { name: "Teddy", weightKg: 8, packageId: "silver-styled-small" },
    ]);
    expect(mixed).toMatchObject({ ok: false });
  });
});

describe("when the name and the column disagree", () => {
  it("refuses, rather than picking whichever is cheaper", () => {
    // A plan called "(x2)" still set to cover one dog. Trusting the name
    // halves the salon's revenue; trusting the column double-charges the
    // family. Only a person knows which is right.
    const notSetUp = { ...SILVER_PLUS_X2, coversPets: 1 };
    const result = quote([dog("Rosie"), dog("Teddy")], [notSetUp]);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.problems[0]).toContain("looks like it covers more than one dog");
    expect(result.problems[0]).toContain("call us");
  });

  it("says nothing for an ordinary single-dog plan", () => {
    const plain = { ...SILVER_PLUS_X2, name: "Silver Plus", coversPets: 1 };
    const result = quoteMembershipSignup({
      dogs: [{ name: "Rosie", weightKg: 8, packageId: "plan:60001" }],
      builtIns: MEMBERSHIP_PACKAGES, plans: [plain],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weeklyTotal).toBe(58);
  });
});
