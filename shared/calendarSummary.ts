/**
 * The appts / pets / earned / expected figures on the Appointments sidebar.
 *
 * Kept out of the page because the distinctions are easy to get wrong, and
 * getting them wrong produces a number that looks plausible and is not:
 *
 *  - Appointments and PETS are different counts. A two-dog booking is one
 *    appointment in MoeGo and two rows here, and the salon thinks in dogs when
 *    planning the day and in bookings when planning the diary. Both are shown.
 *  - EARNED is money taken: completed only. EXPECTED is money booked in,
 *    whether or not it has arrived. Summing the same column under two labels,
 *    which is what the analytics page used to do, makes the pair meaningless.
 *  - Cancellations and no-shows count towards neither. They are still on the
 *    board, so they would otherwise inflate expected revenue with dogs nobody
 *    is expecting.
 */

export interface SummarisableAppointment {
  petId?: number | null;
  price?: string | number | null;
  workflowState?: string | null;
  status?: string | null;
}

export interface CalendarSummaryFigures {
  totalAppointments: number;
  totalPets: number;
  earnedRevenue: number;
  expectedRevenue: number;
}

const DEAD_STATES = new Set(["cancelled", "no_show"]);

export const isDeadAppointment = (a: SummarisableAppointment): boolean =>
  DEAD_STATES.has(String(a.workflowState ?? "")) || DEAD_STATES.has(String(a.status ?? ""));

/** Decimal strings out of MySQL, numbers from anywhere else, junk as 0. */
const amount = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function summariseCalendar(appointments: SummarisableAppointment[]): CalendarSummaryFigures {
  const live = appointments.filter((a) => !isDeadAppointment(a));
  const pets = new Set<number>();
  let earned = 0;
  let expected = 0;

  for (const a of live) {
    if (typeof a.petId === "number") pets.add(a.petId);
    const value = amount(a.price);
    expected += value;
    if (a.workflowState === "complete") earned += value;
  }

  return {
    // Cancelled dogs are still on the board, so "total appts" counts what is
    // actually happening rather than what rows exist.
    totalAppointments: live.length,
    totalPets: pets.size,
    earnedRevenue: Math.round(earned * 100) / 100,
    expectedRevenue: Math.round(expected * 100) / 100,
  };
}
