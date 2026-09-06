import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAppointmentMembershipCoverage } from "../shared/appointmentMembershipCoverage";

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

  it("protects per-pet linkage, covered price handling and all-family companion selection in the implementation", () => {
    const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const calendar = readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");
    const clientDetail = readFileSync(new URL("../client/src/pages/ClientDetail.tsx", import.meta.url), "utf8");

    expect(router).toContain('price: coverage.fullyCovered ? "0.00" : input.price');
    expect(router).toContain('membershipId: coverage.membershipByPetId[petId]?.id ?? null');
    expect(router).toContain("getMembershipCoverage: operationalProcedure");
    expect(router).toContain("getClientMembershipSummary: operationalProcedure");
    expect(calendar).toContain("Weekly membership active");
    expect(calendar).toContain("clientMembershipSummary");
    expect(calendar).toContain("Select the dog or dogs for this appointment to confirm coverage");
    expect(calendar).toContain("{ enabled: !!newAppt.clientId }");
    expect(calendar).toContain("Every selected dog is covered for this service");
    expect(calendar).toContain("selectedFamilyGroups.has(pet.familyGroupId)");
    expect(clientDetail).toContain("bookingFamilyCompanions.map");
    expect(clientDetail).toContain("Array.from(new Set([bookPetId, ...bookFamilyPetIds]))");
  });
});
