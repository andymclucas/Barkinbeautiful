import { describe, expect, it } from "vitest";
import { planStripeRefund } from "./stripeRefundPlan";

describe("what a Stripe refund undoes", () => {
  it("a full refund of a portal payment takes the credit and the booking (the 11/11 test: $2 = $1 + $1)", () => {
    expect(planStripeRefund({ refundCents: 200, creditStandingCents: 100, bookingLines: [{ appointmentId: 7, netCents: 100 }] }))
      .toEqual({ creditReversalCents: 100, bookingReversals: [{ appointmentId: 7, cents: 100 }], unmatchedCents: 0 });
  });

  it("a partial refund takes the credit first — the extra paid over the bill", () => {
    expect(planStripeRefund({ refundCents: 100, creditStandingCents: 100, bookingLines: [{ appointmentId: 7, netCents: 100 }] }))
      .toEqual({ creditReversalCents: 100, bookingReversals: [], unmatchedCents: 0 });
  });

  it("undoes the latest-paid booking first", () => {
    const plan = planStripeRefund({
      refundCents: 15000, creditStandingCents: 0,
      bookingLines: [{ appointmentId: 1, netCents: 14500 }, { appointmentId: 2, netCents: 6000 }],
    });
    expect(plan.bookingReversals).toEqual([{ appointmentId: 2, cents: 6000 }, { appointmentId: 1, cents: 9000 }]);
  });

  it("never undoes more than was recorded, and reports the rest", () => {
    expect(planStripeRefund({ refundCents: 5000, creditStandingCents: 0, bookingLines: [{ appointmentId: 1, netCents: 3000 }] }))
      .toEqual({ creditReversalCents: 0, bookingReversals: [{ appointmentId: 1, cents: 3000 }], unmatchedCents: 2000 });
  });

  it("does nothing for nothing new", () => {
    expect(planStripeRefund({ refundCents: 0, creditStandingCents: 100, bookingLines: [{ appointmentId: 1, netCents: 100 }] }))
      .toEqual({ creditReversalCents: 0, bookingReversals: [], unmatchedCents: 0 });
  });
});
