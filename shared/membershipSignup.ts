/**
 * Pricing a membership a client signed themselves up for.
 *
 * Everything here exists because the person filling the form is the person
 * being charged. A staff member putting a dog on a membership is quoting
 * from a screen they trust; a client is typing a weight into their phone,
 * and the weight is what picks the price band. So:
 *
 * - the price is ALWAYS read from the catalogue, never taken from the
 *   request. A posted price is a number the payer chose;
 * - the chosen package must still be one the dog's weight qualifies for
 *   when it reaches the server, because the list it was picked from was
 *   built in a browser;
 * - every dog in one sign-up shares a visit interval, so a family arrives
 *   together instead of drifting into separate trips across the year.
 *
 * None of this is the last word on whether the membership is right — a
 * staff member approves that, and a client who types 10 kg for a 20 kg
 * dog is caught there. This is the arithmetic, done once, in a place
 * both the quote screen and the approval screen can call.
 */

import {
  assignablePackagesFor,
  validatePlanForAssignment,
  visitsPerYearFor,
  type AssignablePackage,
  type MembershipPlanRow,
} from "./membershipAssignable";
import {
  getMembershipWeightBand,
  type MembershipPackage,
} from "./membershipPackages";

/**
 * A household, not a kennel. Six is past the biggest family the salon has
 * and still far short of the number a bored person would type into a
 * public form.
 */
export const MAX_SIGNUP_DOGS = 6;

/** The weight bands run 0–80 kg; outside that there is no price to quote. */
export const MIN_SIGNUP_WEIGHT_KG = 1;
export const MAX_SIGNUP_WEIGHT_KG = 80;

export type SignupDogInput = {
  name: string;
  weightKg: number;
  /** A built-in id, or "plan:<row id>" for one the salon wrote. */
  packageId: string;
};

export type SignupQuoteLine = {
  petName: string;
  weightKg: number;
  packageId: string;
  packageName: string;
  tier: string;
  serviceType: string;
  /** From the catalogue. Never from the request. */
  weeklyPrice: number;
  appointmentIntervalWeeks: number;
  custom: boolean;
};

export type SignupQuote =
  | {
      ok: true;
      lines: SignupQuoteLine[];
      /** What the client is charged each week, for all their dogs. */
      weeklyTotal: number;
      /** Shared by every dog, so the family comes in together. */
      intervalWeeks: number;
      visitsPerYear: string;
    }
  | { ok: false; problems: string[] };

/**
 * What a dog of this weight may be offered. Exported so the form and the
 * quote agree — the form builds the list, the quote re-derives it.
 *
 * Two things here are easy to get wrong, and both were:
 *
 * `assignablePackagesFor` filters the CUSTOM plans by band and passes the
 * built-ins through untouched, because its caller is expected to have
 * narrowed them already. Handing it the whole catalogue offers a 42 kg
 * Giant the Small band's weekly rate.
 *
 * And no band means no offer. The staff path falls back to the entire
 * catalogue and lets a person choose a band by hand; a client typing a
 * weight into their phone has no such override, so guessing the nearest
 * band would set a price the salon never agreed to.
 */
export function signupPackagesForWeight(
  weightKg: number,
  builtIns: MembershipPackage[],
  plans: MembershipPlanRow[],
): AssignablePackage[] {
  const band = getMembershipWeightBand(weightKg);
  if (!band) return [];
  return assignablePackagesFor(
    builtIns.filter((pkg) => pkg.weightClass === band.id),
    plans,
    band.id,
  ).filter((pkg) => validatePlanForAssignment(pkg).ok);
}

export function quoteMembershipSignup(input: {
  dogs: readonly SignupDogInput[];
  builtIns: MembershipPackage[];
  plans: MembershipPlanRow[];
  maxDogs?: number;
}): SignupQuote {
  const { dogs, builtIns, plans, maxDogs = MAX_SIGNUP_DOGS } = input;
  const problems: string[] = [];

  if (dogs.length === 0) return { ok: false, problems: ["Add at least one dog."] };
  if (dogs.length > maxDogs) {
    return { ok: false, problems: [`We can sign up to ${maxDogs} dogs at once — please call us for more.`] };
  }

  const seenNames = new Set<string>();
  const lines: SignupQuoteLine[] = [];

  for (const dog of dogs) {
    const name = dog.name.trim();
    const label = name || "This dog";

    if (!name) {
      problems.push("Every dog needs a name.");
      continue;
    }
    // Two dogs called Bella in one sign-up is almost always the form being
    // submitted twice, and it would create two memberships for one dog.
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) {
      problems.push(`You have added two dogs called ${name}. Please give them different names.`);
      continue;
    }
    seenNames.add(nameKey);

    if (!Number.isFinite(dog.weightKg) || dog.weightKg < MIN_SIGNUP_WEIGHT_KG || dog.weightKg > MAX_SIGNUP_WEIGHT_KG) {
      problems.push(`${label}'s weight must be between ${MIN_SIGNUP_WEIGHT_KG} and ${MAX_SIGNUP_WEIGHT_KG} kg.`);
      continue;
    }

    const band = getMembershipWeightBand(dog.weightKg);
    if (!band) {
      // The bands have a gap at 35 kg. A dog that falls in one has no
      // price, and inventing the nearest is how a client gets billed a
      // rate the salon never agreed to.
      problems.push(`We do not have a membership price for a dog of ${dog.weightKg} kg. Please call us.`);
      continue;
    }

    const offered = signupPackagesForWeight(dog.weightKg, builtIns, plans);
    const chosen = offered.find((pkg) => pkg.id === dog.packageId);
    if (!chosen) {
      // Either the list moved under the form, or the id was edited.
      // Re-resolving here is what stops a Giant dog being signed up at a
      // Small dog's weekly rate.
      problems.push(`${label} cannot be put on that membership at ${dog.weightKg} kg. Please choose again.`);
      continue;
    }

    lines.push({
      petName: name,
      weightKg: dog.weightKg,
      packageId: chosen.id,
      packageName: chosen.name,
      tier: chosen.tier,
      serviceType: chosen.serviceType,
      weeklyPrice: chosen.weeklyPrice,
      appointmentIntervalWeeks: chosen.appointmentIntervalWeeks,
      custom: chosen.custom,
    });
  }

  if (problems.length > 0) return { ok: false, problems };

  const intervals = Array.from(new Set(lines.map((line) => line.appointmentIntervalWeeks)));
  if (intervals.length > 1) {
    // Deliberate: one visit for the household. Dogs on a 4-weekly and a
    // 6-weekly plan share a date four times a year and need separate trips
    // for the rest, which is not what anyone pictures when they sign two
    // dogs up together.
    return {
      ok: false,
      problems: [
        "All your dogs need to be on the same visit frequency so they can come in together. "
        + `You have chosen ${intervals.sort((a, b) => a - b).map((w) => `${w}-weekly`).join(" and ")}.`,
      ],
    };
  }

  const intervalWeeks = intervals[0]!;
  return {
    ok: true,
    lines,
    // Cents, via integers: 0.1 + 0.2 is not 0.3, and this figure is what
    // becomes the weekly Stripe charge.
    weeklyTotal: lines.reduce((total, line) => total + Math.round(line.weeklyPrice * 100), 0) / 100,
    intervalWeeks,
    visitsPerYear: visitsPerYearFor(intervalWeeks),
  };
}
