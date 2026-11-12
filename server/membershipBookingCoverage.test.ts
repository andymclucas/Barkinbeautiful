import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Every path that can create a groom, named, with its pricing decision
 * recorded.
 *
 * This is deliberately NOT another count of `priceForCoveredAppointment`
 * — appointmentMembershipCoverage.test.ts owns that number, and two
 * pins on one number is the drift this repo keeps paying for. This
 * closes the gap that test writes down beside its own count:
 *
 *   "A count only fails when a path appears or stops delegating; it
 *   cannot tell you a new path was written that never delegated in the
 *   first place."
 *
 * That is exactly what happened twice. `addRecurrenceToAppointment`
 * (06/11/2026) and then `rebook` (03/11/2026, found 07/11/2026) were
 * both written without the guard while the count sat happily at its
 * old value. `rebook` billed members for grooms their weekly payment
 * covers, because it copied the source row's price — and 450 of 456
 * upcoming bookings are MoeGo imports carrying a MoeGo figure.
 *
 * So this enumerates the procedures instead. A new booking path fails
 * here BY NAME, and whoever adds it has to say which column it is in
 * and why.
 */
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/** Priced through the shared rule, because a plan can cover the groom. */
const PRICED_AGAINST_MEMBERSHIP = [
  "rebook",
  "createAppointment",
  "createRecurringAppointments",
  "addRecurrenceToAppointment",
  // One skipped date of a repeat, rebooked with another groomer or day
  // (12/11/2026). Resolves coverage for the new row, like the series.
  "addRecurrenceOccurrence",
  "createMultiPetAppointment",
];

/** Exempt, each for a reason that has to still be true. */
const EXEMPT = {
  // nail_trim and bath_only only, and membershipCoversService answers
  // false for everything but a classic or styled groom.
  createQuickAppointment: "no plan can cover a counter nail clip",
  // priceForAddedFamilyPet instead: null, not zero, because the booking
  // it joins may already carry a combined family figure.
  addPetsToSharedAppointment: "priced by the added-family-pet rule",
  // Puts back rows that already existed. Re-pricing rewrites history.
  undoDeleteAppointment: "restores, does not book",
  // No caller; createGuest and createPreviewGuest are the live paths.
  // Worth wiring if it is ever used, as createAppointment was.
  // Both create the client in the same call, so no plan exists yet.
  createGuest: "creates the client, so there is no plan",
  createPreviewGuest: "creates the client, so there is no plan",
};

/**
 * The procedure enclosing each `insert(appointments)` in routers.ts,
 * found by walking back to the nearest procedure declaration.
 */
function bookingProceduresIn(source: string): string[] {
  const declaration = /^ {2}([a-zA-Z][a-zA-Z0-9_]*): (?:public|protected|operational|admin)Procedure/gm;
  const declarations: { name: string; at: number }[] = [];
  for (let m = declaration.exec(source); m; m = declaration.exec(source)) {
    declarations.push({ name: m[1], at: m.index });
  }
  const names: string[] = [];
  const insert = /insert\(appointments\)/g;
  for (let m = insert.exec(source); m; m = insert.exec(source)) {
    const owner = declarations.filter((d) => d.at < m!.index).pop();
    if (owner) names.push(owner.name);
  }
  return names;
}

describe("every groom-creating path has a recorded pricing decision", () => {
  it("finds the booking procedures where they are expected", () => {
    const found = bookingProceduresIn(read("server/routers.ts"));
    // 11 inserts, and undoDeleteAppointment's snapshot restore is one of
    // them. Sorted and de-duplicated: the question is which procedures
    // can book, not how many times each one writes.
    expect(Array.from(new Set(found)).sort()).toEqual(
      [...PRICED_AGAINST_MEMBERSHIP, ...Object.keys(EXEMPT)].sort(),
    );
  });

  it("leaves nothing unaccounted for", () => {
    /*
     * The assertion that actually does the work. A new booking
     * procedure appears in `found`, is in neither list, and fails here
     * by name — rather than silently joining the exempt six.
     */
    const found = new Set(bookingProceduresIn(read("server/routers.ts")));
    const accounted = new Set([...PRICED_AGAINST_MEMBERSHIP, ...Object.keys(EXEMPT)]);
    const unaccounted = [...found].filter((name) => !accounted.has(name));
    expect(unaccounted, "a new booking path must declare its pricing decision").toEqual([]);
  });

  it("still covers the two routers that book outside the monolith", () => {
    /*
     * membershipSignup writes the plan and its grooms in one call, so
     * coverage is known by construction rather than resolved.
     *
     * waitlist deliberately leaves the price unset for staff to fill —
     * its own comment says so, and that is the safe direction: nobody is
     * overcharged.
     *
     * It also used to set no membershipId, which this test recorded as
     * "a real gap, recorded here rather than left to be rediscovered".
     * Fixed 07/11/2026: the booking now links to the covering plan, so a
     * member's waitlist groom is counted against it. The assertion below
     * flipped from 0 to 1 and is what keeps it that way.
     */
    const signup = read("server/routers/membershipSignup.ts");
    expect(signup).toMatch(/price: "0\.00"/);
    expect(signup).toMatch(/membershipId: createdMembershipIds\[index\]/);

    const waitlist = read("server/routers/waitlist.ts");
    expect((waitlist.match(/insert\(appointments\)/g) ?? []).length).toBe(1);
    expect((waitlist.match(/membershipId:/g) ?? []).length).toBe(1);
  });

  it("links the row to the plan, not only the price", () => {
    // A correct price with a NULL membership_id still loses the disc on
    // the calendar, because showsMembershipMark reads the row's own
    // column rather than the client's plans.
    const src = read("server/routers.ts");
    expect((src.match(/membershipByPetId\[/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
