import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  getEligibleOnlineBookingServices,
  getPetWeightBand,
  isEligibleOnlineBookingService,
  isEligibleOnlineBookingServiceForBand,
} from "../shared/onlineBookingWeightEligibility";

describe("online booking pet weight bands", () => {
  it("assigns every confirmed boundary to exactly one band", () => {
    expect(getPetWeightBand(0)?.id).toBe("small");
    expect(getPetWeightBand(10)?.id).toBe("small");
    expect(getPetWeightBand(11)?.id).toBe("small_medium");
    expect(getPetWeightBand(13)?.id).toBe("small_medium");
    expect(getPetWeightBand(14)?.id).toBe("medium");
    expect(getPetWeightBand(16)?.id).toBe("medium");
    expect(getPetWeightBand(17)?.id).toBe("large");
    expect(getPetWeightBand(25)?.id).toBe("large");
    expect(getPetWeightBand(26)?.id).toBe("extra_large");
    expect(getPetWeightBand(35)?.id).toBe("extra_large");
    expect(getPetWeightBand(36)?.id).toBe("giant");
    expect(getPetWeightBand(80)?.id).toBe("giant");
  });

  it("rejects missing and out-of-range weights", () => {
    expect(getPetWeightBand(undefined)).toBeNull();
    expect(getPetWeightBand("")).toBeNull();
    expect(getPetWeightBand(10.5)).toBeNull();
    expect(getPetWeightBand(80.1)).toBeNull();
  });

  it("only exposes size-labelled service choices for a valid weight", () => {
    expect(getEligibleOnlineBookingServices(undefined)).toEqual([]);
    expect(getEligibleOnlineBookingServices(35)[0]).toMatchObject({
      value: "classic_groom",
      label: "Classic Groom · Extra Large · 26–35kg",
    });
    expect(isEligibleOnlineBookingService("classic_groom", 36)).toBe(true);
    expect(isEligibleOnlineBookingService("not_a_service", 36)).toBe(false);
    expect(isEligibleOnlineBookingService("classic_groom", 81)).toBe(false);
  });
});

/**
 * The portal books a dog the salon already has on file, and most of
 * those dogs have never been weighed. Asking the weight question about
 * them answers "Small" (see getPetWeightBand), so the guard written to
 * reject an unweighed dog accepted every one of them.
 */
describe("eligibility for a dog the salon already knows", () => {
  it("accepts a dog that has a recorded band and no weight", () => {
    expect(isEligibleOnlineBookingServiceForBand("classic_groom", "giant")).toBe(true);
    expect(isEligibleOnlineBookingServiceForBand("classic_groom", "small")).toBe(true);
  });

  it("refuses a dog with neither a weight nor a size", () => {
    expect(isEligibleOnlineBookingServiceForBand("classic_groom", null)).toBe(false);
    expect(isEligibleOnlineBookingServiceForBand("classic_groom", undefined)).toBe(false);
    expect(isEligibleOnlineBookingServiceForBand("classic_groom", "")).toBe(false);
  });

  it("still refuses a service the salon does not take online", () => {
    expect(isEligibleOnlineBookingServiceForBand("not_a_service", "small")).toBe(false);
  });

  /**
   * The weight-shaped check is right for the PUBLIC form, where a
   * weight is typed, and wrong for the portal, where it is read from a
   * database that returns null. Counting rather than spot-checking, so
   * a new portal path that reaches for the weight version fails here
   * instead of silently letting unweighed dogs through again.
   */
  it("keeps the portal booking path on the band check", () => {
    const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    // ZERO since 07/11/2026, and that is the finding rather than a
    // regression. The only call site was onlineBooking.create — an
    // unauthenticated endpoint nothing called — so the band fix this
    // test was written to protect ("lets the 4,478 dogs that have a
    // band book and be priced properly") guarded a path no client could
    // reach. Removing the endpoint orphaned it.
    //
    // createGuest, the path the booking page actually uses, takes
    // weightKg as a REQUIRED input, so it never meets a dog with no
    // weight on file and correctly uses the weight version. The
    // protection is not missing; the problem it solved cannot arise
    // there.
    //
    // isEligibleOnlineBookingServiceForBand is kept, with its own
    // tests, for when a known-pet booking path is built. A pure shared
    // function with no caller costs nothing; an exposed endpoint did.
    expect(routers.split("isEligibleOnlineBookingServiceForBand(").length - 1).toBe(0);
    expect(routers).not.toContain("isEligibleOnlineBookingService(input.serviceType, petWeight)");
  });
});
