import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getMembershipPackageById, getMembershipPackagesForTierAndWeightClass, getMembershipPackagesForWeight, getMembershipWeightBand, MEMBERSHIP_PACKAGES } from "../shared/membershipPackages";

describe("verified Barkin Beautiful VIP membership packages", () => {
  it("uses the final weekly price and appointment interval for every tier", () => {
    expect(MEMBERSHIP_PACKAGES).toHaveLength(48);
    expect(getMembershipPackageById("diamond-classic-small")).toMatchObject({ weeklyPrice: 52, appointmentIntervalWeeks: 2, visitsPerYear: "20 visits per year" });
    expect(getMembershipPackageById("platinum-classic-giant")).toMatchObject({ weeklyPrice: 95, appointmentIntervalWeeks: 3, visitsPerYear: "17 visits per year" });
    expect(getMembershipPackageById("gold-styled-extra_large")).toMatchObject({ weeklyPrice: 48, appointmentIntervalWeeks: 4, visitsPerYear: "13 visits per year" });
    expect(getMembershipPackageById("silver-classic-medium")).toMatchObject({ weeklyPrice: 27, appointmentIntervalWeeks: 6, visitsPerYear: "8–9 visits per year" });
    expect(getMembershipPackageById("bronze-styled-giant")).toMatchObject({ weeklyPrice: 38, appointmentIntervalWeeks: 8, visitsPerYear: "6–7 visits per year" });
  });

  it("limits each pet to packages for its recorded weight band", () => {
    expect(getMembershipWeightBand(10)?.id).toBe("small");
    expect(getMembershipWeightBand(11)?.id).toBe("small_medium");
    expect(getMembershipWeightBand(34)?.id).toBe("extra_large");
    expect(getMembershipWeightBand(35)).toBeNull();
    expect(getMembershipWeightBand(36)?.id).toBe("giant");
    expect(getMembershipWeightBand(81)).toBeNull();
    expect(getMembershipPackagesForWeight("12").every((membershipPackage) => membershipPackage.weightClass === "small_medium")).toBe(true);
    expect(getMembershipPackagesForWeight("12")).toHaveLength(8);
  });

  it("maps a manual tier and approved weight band to only its verified package variants", () => {
    expect(getMembershipPackagesForTierAndWeightClass("diamond", "giant")).toMatchObject([
      { id: "diamond-classic-giant", weeklyPrice: 105, appointmentIntervalWeeks: 2 },
    ]);
    expect(getMembershipPackagesForTierAndWeightClass("gold", "giant")).toMatchObject([
      { id: "gold-classic-giant", weeklyPrice: 47, appointmentIntervalWeeks: 4 },
      { id: "gold-styled-giant", weeklyPrice: 51, appointmentIntervalWeeks: 4 },
    ]);
    expect(getMembershipPackagesForTierAndWeightClass("silver", "small_medium").every((membershipPackage) => membershipPackage.weightClass === "small_medium" && membershipPackage.tier === "silver")).toBe(true);
  });
});

describe("controlled membership creation contract", () => {
  const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
  const formSource = readFileSync(new URL("../client/src/pages/Memberships.tsx", import.meta.url), "utf8");

  it("uses controlled authorised-staff package selection rather than caller-supplied names, prices or billing periods", () => {
    const membershipsSection = routerSource.slice(routerSource.indexOf("const membershipsRouter"), routerSource.indexOf("manageDepartedPet"));
    expect(membershipsSection).toContain("getPackageOptions: operationalProcedure");
    expect(membershipsSection).toContain("create: operationalProcedure");
    expect(membershipsSection).toContain("packageId: z.string().min(1)");
    expect(membershipsSection).toContain("manualWeightClass: z.enum");
    expect(membershipsSection).toContain("requiresManualWeightSelection: !weightBand");
    expect(membershipsSection).toContain("membershipPackage.weightClass !== selectedWeightClass");
    expect(membershipsSection).toContain("input.manualWeightClass !== recordedWeightBand.id");
    expect(membershipsSection).toContain("billingCycleWeeks: 1");
    expect(membershipsSection).toContain("pricePerCycle: membershipPackage.weeklyPrice.toFixed(2)");
    expect(membershipsSection).toContain("appointmentIntervalWeeks: membershipPackage.appointmentIntervalWeeks");
    expect(membershipsSection).toContain("Only an administrator can configure payment collection or a billing date");
    expect(membershipsSection).not.toContain("name: z.string()");
    expect(membershipsSection).not.toContain("pricePerCycle: z.string()");
  });

  it("presents verified packages and derived weekly schedule details without free-text membership fields", () => {
    expect(formSource).toContain("memberships.getPackageOptions.useQuery");
    expect(formSource).toContain("Choose a verified VIP package");
    expect(formSource).toContain("VIP tier");
    expect(formSource).toContain("Approved weight band");
    expect(formSource).toContain("Choose a tier first");
    expect(formSource).toContain("requiresManualWeightSelection");
    expect(formSource).toContain("Billed weekly.");
    expect(formSource).toContain("Every {selectedPackage.appointmentIntervalWeeks} weeks");
    expect(formSource).not.toContain("Membership Name");
    expect(formSource).not.toContain("Price per Cycle ($)");
  });
});
