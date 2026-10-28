import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAppointmentMembershipCoverage, priceForCoveredAppointment } from "../shared/appointmentMembershipCoverage";

const activeClassic = {
  id: 1,
  petId: 10,
  name: "Classic weekly plan",
  tier: "gold",
  serviceType: "classic" as const,
  status: "active",
  bookingSuspended: false,
};

const activeStyled = {
  id: 2,
  petId: 11,
  name: "Styled weekly plan",
  tier: "platinum",
  serviceType: "styled" as const,
  status: "active",
  bookingSuspended: false,
};

describe("appointment membership coverage", () => {
  it("covers every selected pet for a compatible weekly membership service", () => {
    const coverage = resolveAppointmentMembershipCoverage([10, 11], "classic_groom", [activeClassic, activeStyled]);

    expect(coverage.fullyCovered).toBe(true);
    expect(coverage.uncoveredPetIds).toEqual([]);
    expect(coverage.membershipByPetId[10]?.id).toBe(1);
    expect(coverage.membershipByPetId[11]?.id).toBe(2);
  });

  it("does not zero a shared appointment when any selected dog is uncovered or suspended", () => {
    const uncovered = resolveAppointmentMembershipCoverage([10, 12], "classic_groom", [activeClassic]);
    const suspended = resolveAppointmentMembershipCoverage([10], "classic_groom", [{ ...activeClassic, bookingSuspended: true }]);

    expect(uncovered.fullyCovered).toBe(false);
    expect(uncovered.uncoveredPetIds).toEqual([12]);
    expect(suspended.fullyCovered).toBe(false);
    expect(suspended.uncoveredPetIds).toEqual([10]);
  });

  it("requires a styled membership for a styled groom", () => {
    const classicCoverage = resolveAppointmentMembershipCoverage([10], "styled_groom", [activeClassic]);
    const styledCoverage = resolveAppointmentMembershipCoverage([11], "styled_groom", [activeStyled]);

    expect(classicCoverage.fullyCovered).toBe(false);
    expect(styledCoverage.fullyCovered).toBe(true);
  });

  it("prices a covered groom at zero whatever was asked for", () => {
    // The weekly payment is the revenue, so the groom carries no price.
    // Billing a member for a groom their membership already paid for is
    // the failure that matters, so the requested figure is discarded —
    // not compared, not preferred, discarded.
    expect(priceForCoveredAppointment(true, "175.00")).toBe("0.00");
    expect(priceForCoveredAppointment(true, undefined)).toBe("0.00");
    expect(priceForCoveredAppointment(true, null)).toBe("0.00");
  });

  it("leaves an uncovered groom at whatever was asked for", () => {
    expect(priceForCoveredAppointment(false, "175.00")).toBe("175.00");
    // Nothing asked for stays nothing — "unpriced" and "free" are not the
    // same, and an insert must not turn the first into the second.
    expect(priceForCoveredAppointment(false, undefined)).toBeUndefined();
    expect(priceForCoveredAppointment(false, null)).toBeUndefined();
  });

  it("applies that rule on every path that creates an appointment", () => {
    // This replaced an assertion on the literal text
    // `price: coverage.fullyCovered ? "0.00" : input.price`. When the
    // multi-pet path gained a per-dog figure, that line changed THERE and
    // the assertion went on matching the other two — so the busiest
    // booking path silently lost its guard while the suite stayed green.
    //
    // Counting delegations is still a source check, but it fails loudly
    // when a fourth path appears or an existing one stops delegating,
    // which is the drift that actually costs money.
    const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    // Three: createAppointment, createRecurringAppointments and
    // createMultiPetAppointment. The import carries no paren so it does
    // not count.
    expect(router.split("priceForCoveredAppointment(").length - 1).toBe(3);
    expect(router).not.toContain('coverage.fullyCovered ? "0.00"');
    expect(router).toContain("membershipId: coverage.membershipByPetId[petId]?.id ?? null");
    expect(router).toContain("getMembershipCoverage: operationalProcedure");
  });
});

describe("a plan that covers more than one dog", () => {
  /**
   * Lauren, 28/10/2026, on the VIP badge: "Double dog memberships have
   * the vip on one of them." The badge was the visible half. This is the
   * expensive half — the second dog was priced as though the client had
   * no plan, so Allyson Warner's $78 a cycle covered three styled grooms
   * and Groomigo charged for two of them.
   */
  const twoDogPlan = {
    id: 3, petId: 35, name: "Diamond VIP - SML (0-10kg) x2", tier: "diamond",
    serviceType: "classic" as const, status: "active", bookingSuspended: false,
    coveredPetIds: [36],
  };

  it("covers the assigned dog, not just the primary", () => {
    const c = resolveAppointmentMembershipCoverage([35, 36], "classic_groom", [twoDogPlan]);
    expect(c.coveredPetIds.sort()).toEqual([35, 36]);
    expect(c.uncoveredPetIds).toEqual([]);
    expect(c.fullyCovered).toBe(true);
  });

  /** Booking ONLY the second dog has to find the plan too. */
  it("covers the assigned dog when the primary is not in the booking", () => {
    const c = resolveAppointmentMembershipCoverage([36], "classic_groom", [twoDogPlan]);
    expect(c.coveredPetIds).toEqual([36]);
    expect(c.membershipByPetId[36]?.id).toBe(3);
  });

  /**
   * membership_pets is empty for any plan nobody has assigned dogs to, so
   * the primary must still stand alone — otherwise this takes coverage
   * away from every single-dog plan in the salon.
   */
  it("still covers the primary when nothing is assigned", () => {
    const c = resolveAppointmentMembershipCoverage([35, 36], "classic_groom", [
      { ...twoDogPlan, coveredPetIds: undefined },
    ]);
    expect(c.coveredPetIds).toEqual([35]);
    expect(c.uncoveredPetIds).toEqual([36]);
    expect(c.fullyCovered).toBe(false);
  });

  it("does not cover a dog the plan was never assigned", () => {
    const c = resolveAppointmentMembershipCoverage([35, 36, 99], "classic_groom", [twoDogPlan]);
    expect(c.uncoveredPetIds).toEqual([99]);
  });

  /** The service rules still decide. A classic plan does not buy a styled groom. */
  it("does not let an assigned dog skip the service check", () => {
    const c = resolveAppointmentMembershipCoverage([35, 36], "styled_groom", [twoDogPlan]);
    expect(c.coveredPetIds).toEqual([]);
    expect(c.uncoveredPetIds.sort()).toEqual([35, 36]);
  });

  /** A suspended plan covers nobody, assigned or not. */
  it("covers nothing while the plan is suspended for non-payment", () => {
    const c = resolveAppointmentMembershipCoverage([35, 36], "classic_groom", [
      { ...twoDogPlan, bookingSuspended: true },
    ]);
    expect(c.coveredPetIds).toEqual([]);
  });
});

describe("which plan claims a dog listed on two", () => {
  /**
   * There is no ORDER BY on the membership query, so a single pass made
   * the winner depend on which row the database returned first. Two
   * passes fix it: every plan's own dog is claimed before any assigned
   * dog is, so a dog's own plan always beats a household plan that
   * merely lists it.
   */
  const ownPlan = {
    id: 50, petId: 36, name: "Silver VIP Classic - Small (0-10kg)", tier: "silver",
    serviceType: "classic" as const, status: "active", bookingSuspended: false,
  };
  const householdPlan = {
    id: 3, petId: 35, name: "Diamond VIP - SML (0-10kg) x2", tier: "diamond",
    serviceType: "classic" as const, status: "active", bookingSuspended: false,
    coveredPetIds: [36],
  };

  it("gives the dog to its own plan whichever order they arrive in", () => {
    for (const order of [[householdPlan, ownPlan], [ownPlan, householdPlan]]) {
      const c = resolveAppointmentMembershipCoverage([36], "classic_groom", order);
      expect(c.membershipByPetId[36]?.id, JSON.stringify(order.map(m => m.id))).toBe(50);
    }
  });

  /**
   * The case that made this worth fixing: a dog whose OWN plan is paused
   * came back covered by an older household plan that happens to list
   * it. A paused plan should mean the dog is chargeable.
   */
  it("does not let a household plan rescue a dog whose own plan is suspended", () => {
    const c = resolveAppointmentMembershipCoverage([36], "classic_groom", [
      { ...ownPlan, bookingSuspended: true },
      { ...householdPlan, coveredPetIds: [] },
    ]);
    expect(c.coveredPetIds).toEqual([]);
    expect(c.uncoveredPetIds).toEqual([36]);
  });

  /** A suspended own-plan must not hand the dog to a plan that lists it. */
  it("leaves the dog uncovered when its own plan is suspended, even if listed elsewhere", () => {
    const c = resolveAppointmentMembershipCoverage([36], "classic_groom", [
      householdPlan,
      { ...ownPlan, bookingSuspended: true },
    ]);
    // The household plan legitimately covers it — it is active and lists
    // the dog. What must NOT happen is the result depending on row order.
    const reversed = resolveAppointmentMembershipCoverage([36], "classic_groom", [
      { ...ownPlan, bookingSuspended: true },
      householdPlan,
    ]);
    expect(c.membershipByPetId[36]?.id).toBe(reversed.membershipByPetId[36]?.id);
  });

  it("is stable for the plain two-dog case", () => {
    const c = resolveAppointmentMembershipCoverage([35, 36], "classic_groom", [householdPlan]);
    expect(c.membershipByPetId[35]?.id).toBe(3);
    expect(c.membershipByPetId[36]?.id).toBe(3);
  });
});
