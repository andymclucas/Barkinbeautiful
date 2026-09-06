import { describe, expect, it } from "vitest";
import { getLargeDogCapacityResult, isLargeDogFullGroom } from "../shared/onlineBookingLargeDogCapacity";

const morning = new Date("2026-08-17T00:00:00.000Z"); // 10:00am AEST
const afternoon = new Date("2026-08-17T03:00:00.000Z"); // 1:00pm AEST

describe("large dog online booking capacity", () => {
  it("treats Large, Extra Large and Giant Classic or Styled Grooms as large-dog full grooms", () => {
    expect(isLargeDogFullGroom("classic_groom", 17)).toBe(true);
    expect(isLargeDogFullGroom("styled_groom", 80)).toBe(true);
    expect(isLargeDogFullGroom("classic_groom", 16)).toBe(false);
    expect(isLargeDogFullGroom("bath_only", 43)).toBe(false);
  });

  it("allows one large-dog full groom per groomer in each half-day", () => {
    const existing = [{ staffId: 2, serviceType: "classic_groom", scheduledStart: morning, petWeightKg: 26 }];
    expect(getLargeDogCapacityResult({ existingBookings: existing, requestedStaffId: 2, requestedServiceType: "classic_groom", requestedWeightKg: 36, requestedStart: morning })).toMatchObject({ available: false });
    expect(getLargeDogCapacityResult({ existingBookings: existing, requestedStaffId: 2, requestedServiceType: "classic_groom", requestedWeightKg: 36, requestedStart: afternoon })).toEqual({ available: true });
    expect(getLargeDogCapacityResult({ existingBookings: existing, requestedStaffId: 3, requestedServiceType: "classic_groom", requestedWeightKg: 36, requestedStart: morning })).toEqual({ available: true });
  });

  it("rejects a fourth large-dog full groom anywhere in the salon on the same day", () => {
    const existing = [
      { staffId: 2, serviceType: "classic_groom", scheduledStart: morning, petWeightKg: 17 },
      { staffId: 3, serviceType: "styled_groom", scheduledStart: afternoon, petWeightKg: 26 },
      { staffId: 4, serviceType: "classic_groom", scheduledStart: morning, petWeightKg: 36 },
    ];
    expect(getLargeDogCapacityResult({ existingBookings: existing, requestedStaffId: 5, requestedServiceType: "styled_groom", requestedWeightKg: 40, requestedStart: afternoon })).toMatchObject({ available: false, reason: "The salon has reached its daily limit of three large-dog full grooms" });
  });
});
