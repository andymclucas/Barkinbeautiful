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

import { membershipVisitValueCents } from "./membershipVisitValue";

export interface SummarisableAppointment {
  petId?: number | null;
  price?: string | number | null;
  workflowState?: string | null;
  status?: string | null;
  /** Set when a membership covers this groom. The price is then nil. */
  membershipId?: number | null;
  /** The covering plan's weekly rate and tier, for its visit value. */
  membershipPricePerCycle?: string | number | null;
  membershipTier?: string | null;
  /**
   * True when this dog's CLIENT holds an active membership but this
   * booking is not linked to it.
   *
   * 128 of 713 upcoming bookings are in that state — MoeGo imports that
   * never carried the link, plus the second and third dogs of multi-dog
   * households. They are counted separately rather than folded in,
   * because guessing would be wrong in both directions: some of those
   * dogs are genuinely covered and some are a household's extra dog who
   * really is paying.
   */
  clientHasMembership?: boolean | number | null;
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
  /**
   * Subscription revenue the day's memberships carry, in dollars.
   *
   * Weekly rate x the tier's weeks between grooms, counted once per
   * PLAN. Real money, arriving weekly rather than at the counter.
   */
  membershipVisitValue: number;
  /**
   * Dogs whose client holds a membership that this booking is not
   * linked to, so they are in neither figure above with any confidence.
   * Shown so the covered count is not read as complete.
   */
  unlinkedMembershipPetCount: number;
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
  const unlinkedMembershipPets = new Set<number>();
  const plans: Array<{ membershipId: number; pricePerCycle?: string | number | null; tier?: string | null }> = [];
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
      // MySQL EXISTS arrives as 0/1, not a boolean, so this accepts
      // both rather than casting one away at the call site.
      if (!a.membershipId && Boolean(a.clientHasMembership)) unlinkedMembershipPets.add(a.petId);
    }
    if (a.membershipId) {
      plans.push({
        membershipId: a.membershipId,
        pricePerCycle: a.membershipPricePerCycle,
        tier: a.membershipTier,
      });
    }
    /**
     * A covered groom is not collectable, whatever price sits on it.
     *
     * appointmentInvoicing bills extras only once a membershipId is
     * set, so the price on the row is ignored at billing time — but
     * this used to count it anyway, which put money into "Booked in"
     * and "Still to collect" that nobody would ever be asked for. On
     * 28/10/2026 that was $1,360 of priced-but-covered bookings
     * promising revenue the invoice path had already written off.
     *
     * Extras are not in `price` — they live on appointmentAddOns and
     * are billed separately — so zeroing this does not hide them.
     */
    const value = a.membershipId ? 0 : amount(a.price);
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
    membershipVisitValue: membershipVisitValueCents(plans) / 100,
    unlinkedMembershipPetCount: unlinkedMembershipPets.size,
    cancelledCount: appointments.length - live.length,
  };
}
