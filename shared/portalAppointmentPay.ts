/**
 * Paying today's appointment from the client portal, and putting anything
 * over the bill on their account.
 *
 * Andy, 11/11/2026, to Lauren: "I'll add a 'pay for appointment' button,
 * which will only be available for the current appointment they have.
 * Unless they want to pre-pay any amount, which will deduct that amount
 * off the bill and then add the rest as store credit." A $300 bill paid
 * with $500 puts $300 on the booking and $200 on account.
 *
 * Decided with Andy the same day: today's booking only; at least the bill,
 * anything over becomes store credit; capped so a typo cannot charge
 * thousands.
 */

/** The most a client can pay in one go, unless the bill itself is larger. */
export const PORTAL_PAY_CAP_CENTS = 100_000; // 1,000 dollars

export function portalPayMaxCents(owedCents: number): number {
  return Math.max(PORTAL_PAY_CAP_CENTS, Math.max(0, Math.round(owedCents)));
}

export type PortalPayCheck =
  | { ok: true; toBookingCents: number; toCreditCents: number }
  | { ok: false; error: string };

const dollars = (cents: number) => "$" + (cents / 100).toFixed(2);

/** What the client asked to pay, checked against what is owing now. */
export function checkPortalPayment(input: { owedCents: number; amountCents: number }): PortalPayCheck {
  const owed = Math.max(0, Math.round(input.owedCents));
  const amount = Math.round(input.amountCents);
  if (owed <= 0) return { ok: false, error: "There's nothing to pay for today's appointment." };
  if (!Number.isFinite(amount) || amount < owed) {
    return { ok: false, error: "Please pay at least today's bill, " + dollars(owed) + "." };
  }
  const max = portalPayMaxCents(owed);
  if (amount > max) return { ok: false, error: "The most you can pay here is " + dollars(max) + "." };
  return { ok: true, toBookingCents: owed, toCreditCents: amount - owed };
}

/**
 * Where money that has ARRIVED goes, decided when Stripe confirms it rather
 * than when the page was opened: the booking takes what it still owes at
 * that moment, and the rest is store credit. So a second payment, or one
 * made after the bill was settled at the counter, is never lost. It is on
 * the client's account, and the caller tells the salon.
 */
export function splitArrivedPayment(paidCents: number, owingNowCents: number): { toBookingCents: number; toCreditCents: number } {
  const paid = Math.max(0, Math.round(paidCents));
  const toBooking = Math.min(paid, Math.max(0, Math.round(owingNowCents)));
  return { toBookingCents: toBooking, toCreditCents: paid - toBooking };
}

/**
 * One of today's dogs, for deciding whether the bill is ready to pay.
 * `total` null means no figure: fine for a membership groom with no extras
 * (it owes nothing), but an unpriced casual groom means the bill is not
 * finished and must not be paid yet.
 */
export type TodaysDog = { total: string | null; coveredByMembership: boolean; owedCents: number };

export function todaysBillReady(dogs: readonly TodaysDog[]): boolean {
  if (dogs.length === 0) return false;
  return dogs.every((d) => d.total !== null || d.coveredByMembership);
}
