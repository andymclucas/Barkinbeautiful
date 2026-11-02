/**
 * How one invoice payment lands on the dogs the invoice covers.
 *
 * Pure, because it is money and the alternative is discovering the rule
 * by reading a webhook. The caller supplies each appointment's billable
 * total and the payments already taken against it; this decides who
 * gets what.
 *
 * Three rules, each of which has a wrong answer that looks plausible:
 *
 * - Allocate against what each dog still OWES, not what it is worth.
 *   A booking half settled at the counter must only take the
 *   remainder, or the panel shows it overpaid and the next person
 *   refunds money nobody is owed.
 * - A dog with no price takes nothing. `summarisePayments` returns a
 *   null outstanding for one, and "owing" is meaningless without a
 *   figure; guessing would bill a dog an amount nobody set. Cancelled
 *   dogs arrive here as null too.
 * - Money left over is REPORTED, never parked on the last dog. It
 *   means the invoice covers something besides these grooms, or was
 *   already settled. Forcing it onto an appointment would overstate
 *   what that dog was paid and quietly corrupt the day's takings.
 */
import { summarisePayments, type PaymentLine } from "./splitPayments";
import { allocatePayments } from "./invoiceEmail";

export type InvoiceAppointmentBill = {
  appointmentId: number;
  /** The billable figure, or null when none was ever recorded. */
  total: string | number | null | undefined;
  /** Payments already taken against this appointment. */
  paidLines: readonly PaymentLine[];
};

export type InvoicePaymentAllocation = {
  posted: { appointmentId: number; amount: number }[];
  /** Dollars the appointments could not absorb. */
  unallocated: number;
};

export function allocateInvoicePayment(
  bills: readonly InvoiceAppointmentBill[],
  amount: number,
): InvoicePaymentAllocation {
  const paid = Number.isFinite(amount) && amount > 0 ? amount : 0;

  const outstanding = bills.map((bill) =>
    Math.max(0, summarisePayments(bill.total, bill.paidLines).outstanding ?? 0),
  );

  const split = allocatePayments(outstanding, paid);
  const posted = bills
    .map((bill, i) => ({ appointmentId: bill.appointmentId, amount: split[i] }))
    .filter((p) => p.amount > 0);

  const allocated = posted.reduce((sum, p) => sum + p.amount, 0);
  return {
    posted,
    unallocated: Math.max(0, Math.round((paid - allocated) * 100) / 100),
  };
}
