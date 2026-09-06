export type LargeDogCapacityBooking = {
  staffId: number | null;
  serviceType: string;
  scheduledStart: Date | string | number;
  petWeightKg: number | string | null;
};

const LARGE_DOG_MIN_WEIGHT_KG = 17;
const FULL_GROOM_SERVICES = new Set(["classic_groom", "styled_groom"]);
const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

export function isLargeDogFullGroom(serviceType: string, petWeightKg: number | string | null | undefined) {
  const weight = Number(petWeightKg);
  return Number.isFinite(weight) && weight >= LARGE_DOG_MIN_WEIGHT_KG && FULL_GROOM_SERVICES.has(serviceType);
}

export function getAestHalfDay(scheduledStart: Date | string | number) {
  const aest = new Date(new Date(scheduledStart).getTime() + AEST_OFFSET_MS);
  return aest.getUTCHours() < 12 ? "morning" : "afternoon";
}

export function getLargeDogCapacityResult(params: {
  existingBookings: LargeDogCapacityBooking[];
  requestedStaffId: number;
  requestedServiceType: string;
  requestedWeightKg: number;
  requestedStart: Date;
}) {
  if (!isLargeDogFullGroom(params.requestedServiceType, params.requestedWeightKg)) {
    return { available: true } as const;
  }

  const largeDogFullGrooms = params.existingBookings.filter((booking) =>
    isLargeDogFullGroom(booking.serviceType, booking.petWeightKg),
  );
  if (largeDogFullGrooms.length >= 3) {
    return { available: false, reason: "The salon has reached its daily limit of three large-dog full grooms" } as const;
  }

  const requestedHalfDay = getAestHalfDay(params.requestedStart);
  const staffHalfDayCount = largeDogFullGrooms.filter((booking) =>
    booking.staffId === params.requestedStaffId && getAestHalfDay(booking.scheduledStart) === requestedHalfDay,
  ).length;
  if (staffHalfDayCount >= 1) {
    return {
      available: false,
      reason: `That groomer already has a large-dog full groom in the ${requestedHalfDay}`,
    } as const;
  }

  return { available: true } as const;
}
