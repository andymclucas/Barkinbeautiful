/**
 * What a Stripe refund undoes in Groomigo.
 *
 * Andy, 11/11/2026: "build the refund handling into Stripe". Until now a
 * refund made in Stripe changed nothing here: the booking still read paid,
 * and store credit bought by the payment stayed on the account, so a
 * refunded client kept both. Staff had to undo it by hand, and the alert
 * that asked them to was the only thing standing between the salon and a
 * double give-back.
 *
 * A refund is recorded the way the payment panel records one: a NEGATIVE
 * line, never an edit of the original (server/routers/payments.ts).
 *
 * Order: store credit first, then the bookings. The portal is the only
 * thing that turns a card payment into credit, and the credit is the part
 * paid OVER the bill — the part a salon refunds first when a client asks
 * for their extra back. What is left comes off the bookings, latest-paid
 * first, so a refund of the most recent visit undoes the most recent visit.
 */

export type RefundBookingLine = {
  appointmentId: number;
  /** What this payment intent still has standing on this appointment, net of earlier refunds. */
  netCents: number;
};

export type RefundPlan = {
  creditReversalCents: number;
  bookingReversals: { appointmentId: number; cents: number }[];
  /** Refunded money that matched nothing Groomigo recorded for this payment. */
  unmatchedCents: number;
};

export function planStripeRefund(input: {
  /** New money refunded this time: Stripe's running total minus what was already undone. */
  refundCents: number;
  /** Store credit this payment added and has not already been reversed. */
  creditStandingCents: number;
  /** Booking lines for this payment, latest-paid LAST (so they are undone from the end). */
  bookingLines: readonly RefundBookingLine[];
}): RefundPlan {
  let left = Math.max(0, Math.round(input.refundCents));
  const credit = Math.min(left, Math.max(0, Math.round(input.creditStandingCents)));
  left -= credit;

  const bookingReversals: { appointmentId: number; cents: number }[] = [];
  for (let i = input.bookingLines.length - 1; i >= 0 && left > 0; i--) {
    const line = input.bookingLines[i];
    const take = Math.min(left, Math.max(0, Math.round(line.netCents)));
    if (take > 0) {
      bookingReversals.push({ appointmentId: line.appointmentId, cents: take });
      left -= take;
    }
  }
  return { creditReversalCents: credit, bookingReversals, unmatchedCents: left };
}
