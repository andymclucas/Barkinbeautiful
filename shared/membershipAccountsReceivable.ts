export type MembershipAccountInput = {
  membershipStatus: "active" | "paused" | "cancelled" | "pending_payment" | "expired";
  failedPaymentCount: number;
  bookingSuspended: boolean;
  paymentAmount: number;
  ledgerPaymentAmount: number;
  appointmentGroomValue: number;
  ledgerGroomValue: number;
  unvaluedCompletedGrooms: number;
};

export type MembershipAccountStatus = "up_to_date" | "grace_period" | "declined" | "cancelled" | "arrears_review";

const currency = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export function calculateMembershipAccount(input: MembershipAccountInput) {
  const paidToDate = currency(input.paymentAmount + input.ledgerPaymentAmount);
  const groomValueDelivered = currency(input.appointmentGroomValue + input.ledgerGroomValue);
  const arrearsAmount = currency(Math.max(0, groomValueDelivered - paidToDate));
  const creditAmount = currency(Math.max(0, paidToDate - groomValueDelivered));

  let accountStatus: MembershipAccountStatus = "up_to_date";
  if (input.membershipStatus === "cancelled" || input.membershipStatus === "expired") accountStatus = "cancelled";
  else if (input.bookingSuspended || input.failedPaymentCount >= 2) accountStatus = "declined";
  else if (input.membershipStatus === "pending_payment" || input.failedPaymentCount === 1) accountStatus = "grace_period";
  else if (arrearsAmount > 0) accountStatus = "arrears_review";

  return {
    paidToDate,
    groomValueDelivered,
    arrearsAmount,
    creditAmount,
    accountStatus,
    requiresBookingReview: arrearsAmount > 0,
    invoiceReady: arrearsAmount > 0 && input.unvaluedCompletedGrooms === 0,
    unvaluedCompletedGrooms: input.unvaluedCompletedGrooms,
  };
}
