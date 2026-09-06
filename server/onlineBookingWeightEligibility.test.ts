import { describe, expect, it } from "vitest";
import {
  getEligibleOnlineBookingServices,
  getPetWeightBand,
  isEligibleOnlineBookingService,
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
