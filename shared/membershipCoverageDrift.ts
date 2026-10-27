/**
 * What a pause does to grooms that are already in the diary.
 *
 * Coverage is decided ONCE, when a booking is made, and frozen onto the
 * appointment as a price of 0.00 and a membershipId. Nothing
 * re-evaluates it afterwards, so pausing a membership leaves two gaps
 * pointing in opposite directions:
 *
 *  - A groom booked BEFORE the pause and falling inside it is still
 *    marked covered. The dog is groomed for nothing while the weekly
 *    fee is skipped. One full-price groom is worth several weeks of the
 *    $26.80 average fee, so a month's pause with two grooms already
 *    booked costs the salon more than it saves the client.
 *  - A groom booked DURING the pause is priced at the Casual rate with
 *    no membership attached, because the client was not a member when
 *    they booked. If billing restarts before that appointment, they pay
 *    the restarted fee AND the full price for the same groom.
 *
 * **This module proposes; it does not decide.** It returns the
 * appointments a human should look at, and nothing here reprices or
 * moves anything. That is the rule shared/petPassingReview.ts already
 * sets for the other place where an automatic correction would be
 * cheaper than asking — repricing a booking a client has already been
 * quoted is not a decision software should take on its own.
 */

import { isDeadAppointment } from "./calendarSummary";

export type DriftAppointment = {
  id: number;
  petId?: number | null;
  petName?: string | null;
  scheduledStart: Date;
  price?: string | number | null;
  membershipId?: number | null;
  workflowState?: string | null;
  status?: string | null;
};

const money = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Live, in the future, and not already cancelled off the board. */
function upcoming(appointment: DriftAppointment, from: Date): boolean {
  if (isDeadAppointment(appointment)) return false;
  return appointment.scheduledStart.getTime() >= from.getTime();
}

/**
 * Grooms that will be delivered free while the fee is not being paid.
 *
 * `until` is the restart date. A manual pause has none, so the caller
 * passes a horizon instead — the alternative is returning every booking
 * the client will ever have, which is not a list anybody can act on.
 */
export function groomsFreeDuringPause(
  appointments: readonly DriftAppointment[],
  options: { membershipId: number; from: Date; until: Date },
): DriftAppointment[] {
  return appointments
    .filter((a) => a.membershipId === options.membershipId)
    .filter((a) => upcoming(a, options.from))
    .filter((a) => a.scheduledStart.getTime() < options.until.getTime())
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
}

/**
 * Grooms booked at the Casual rate that the restarted membership would
 * have covered.
 *
 * Keyed on the membership's own pet, not the client: a household can
 * have one dog on a membership and another that is not, and the second
 * dog's booking is correctly priced.
 */
export function groomsToRecover(
  appointments: readonly DriftAppointment[],
  options: { petIds: readonly number[]; from: Date },
): DriftAppointment[] {
  const pets = new Set(options.petIds);
  return appointments
    .filter((a) => a.petId != null && pets.has(a.petId))
    .filter((a) => upcoming(a, options.from))
    // Not already covered, and actually being charged for.
    .filter((a) => a.membershipId == null && money(a.price) > 0)
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
}

/** What those grooms are worth, for a figure staff can weigh. */
export function totalPrice(appointments: readonly DriftAppointment[]): string {
  const cents = appointments.reduce((sum, a) => sum + Math.round(money(a.price) * 100), 0);
  return (cents / 100).toFixed(2);
}

/**
 * The sentence shown before a pause is confirmed.
 *
 * Deliberately states the consequence rather than the rule: "2 grooms
 * already booked will still be free" is something a receptionist can
 * act on, where "coverage is frozen at booking time" is not.
 */
export function describeFreeGrooms(
  grooms: readonly DriftAppointment[],
  formatDate: (date: Date) => string,
): string | null {
  if (grooms.length === 0) return null;
  const names = Array.from(new Set(grooms.map((g) => g.petName).filter(Boolean)));
  const who = names.length > 0 ? names.join(" & ") : "this dog";
  const when = grooms.map((g) => formatDate(g.scheduledStart)).join(", ");
  return grooms.length === 1
    ? `${who} already has a groom booked on ${when}. It stays free — the membership covered it when it was booked, and pausing does not change that.`
    : `${who} already has ${grooms.length} grooms booked during this pause (${when}). They stay free — the membership covered them when they were booked, and pausing does not change that.`;
}
