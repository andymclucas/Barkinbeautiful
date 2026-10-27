/**
 * The appts / pets / earned / expected figures on the Appointments sidebar.
 *
 * Kept out of the page because the distinctions are easy to get wrong, and
 * getting them wrong produces a number that looks plausible and is not:
 *
 *  - Appointments and PETS are different counts. A two-dog booking is one
 *    appointment in MoeGo and two rows here, and the salon thinks in dogs when
 *    planning the day and in bookings when planning the diary. Both are shown.
 *  - EARNED is the price of completed work. It is NOT money taken, and the
 *    label used to claim it was. On 27/10/2026 it read $1,508 against $350
 *    actually paid — a completed groom nobody has settled still counts
 *    towards it. TAKEN is the till figure, from recorded payments.
 *  - MEMBERSHIP dogs are counted apart from paying ones, because a covered
 *    groom carries no price at all: it contributes nothing to any money
 *    column here and the revenue arrived in a weekly debit instead. Without
 *    the count, a day of 25 covered dogs and 10 paying ones looks like a
 *    quiet day rather than a full one.
 *  - EXPECTED is money booked in, whether or not it has arrived. Summing the
 *    same column under two labels, which is what the analytics page used to
 *    do, makes the pair meaningless.
 *  - Cancellations and no-shows count towards neither. They are still on the
 *    board, so they would otherwise inflate expected revenue with dogs nobody
 *    is expecting. They ARE counted separately, because the toolbar counts
 *    every row on the day and two figures that differ with no explanation is
 *    how a correct number gets reported as a bug.
 */

export interface SummarisableAppointment {
  petId?: number | null;
  price?: string | number | null;
  workflowState?: string | null;
  status?: string | null;
  /** Set when a membership covers this groom. The price is then nil. */
  membershipId?: number | null;
  /** Money recorded against this appointment, however it was taken. */
  paidAmount?: string | number | null;
}

export interface CalendarSummaryFigures {
  totalAppointments: number;
  totalPets: number;
  /** Price of completed work. NOT money in — see takenRevenue. */
  earnedRevenue: number;
  expectedRevenue: number;
  /** Money actually recorded as paid against the day's dogs. */
  takenRevenue: number;
  /**
   * Priced work still unsettled, summed per dog.
   *
   * Per dog rather than in aggregate so one client paying over the odds
   * cannot mask another client's debt — netting them would show a day
   * as square while somebody still owes for their groom.
   */
  outstandingRevenue: number;
  /** Dogs whose groom a membership covers. They carry no price. */
  membershipPetCount: number;
  /** Dogs being charged for the day's work. */
  payingPetCount: number;
  /** Cancelled and no-show rows, excluded from every figure above. */
  cancelledCount: number;
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
  const membershipPets = new Set<number>();
  const payingPets = new Set<number>();
  let earned = 0;
  let expected = 0;
  let taken = 0;
  let outstanding = 0;

  for (const a of live) {
    if (typeof a.petId === "number") {
      pets.add(a.petId);
      // Counted by DOG, like every other figure on this panel. A dog
      // booked twice in a day is one dog on the board.
      (a.membershipId ? membershipPets : payingPets).add(a.petId);
    }
    const value = amount(a.price);
    const paid = amount(a.paidAmount);
    expected += value;
    taken += paid;
    if (a.workflowState === "complete") earned += value;
    // Floored at zero per dog: an overpayment is not a credit against
    // the next client's bill.
    outstanding += Math.max(0, value - paid);
  }

  return {
    // Cancelled dogs are still on the board, so "total appts" counts what is
    // actually happening rather than what rows exist.
    totalAppointments: live.length,
    totalPets: pets.size,
    earnedRevenue: Math.round(earned * 100) / 100,
    expectedRevenue: Math.round(expected * 100) / 100,
    takenRevenue: Math.round(taken * 100) / 100,
    outstandingRevenue: Math.round(outstanding * 100) / 100,
    membershipPetCount: membershipPets.size,
    payingPetCount: payingPets.size,
    cancelledCount: appointments.length - live.length,
  };
}
