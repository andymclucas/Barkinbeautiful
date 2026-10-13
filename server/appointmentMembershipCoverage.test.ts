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
