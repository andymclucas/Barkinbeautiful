/**
 * What the green button on the board's "Mark as Out?" dialog says.
 *
 * It used to follow a "Mark as Paid" tick that recorded nothing: the
 * server dropped it, and a booking is only ever paid when its recorded
 * payments add up (server/routers/payments.ts). Andy, 18/11/2026, chose
 * to put the real payment panel in the dialog instead, so the button now
 * reads what is actually owing on the dog.
 *
 * It never blocks: a dog can always go home with money still owing, the
 * same as before. It only says so honestly.
 */
export type MarkOutButton = {
  label: string;
  /** True when the dog is leaving with money still owing. */
  pending: boolean;
};

export function markOutButton(
  outstanding: number | null | undefined,
  total?: number | null,
): MarkOutButton {
  // No figure yet (still loading) or no price on the booking at all: there
  // is nothing to call paid or pending, so the button just says what it does.
  if (outstanding === null || outstanding === undefined || Number.isNaN(outstanding)) {
    return { label: "OUT", pending: false };
  }
  // A groom priced at nothing, which is every membership groom with no
  // extras: no money was due, so "Paid" would claim a payment nobody took.
  if (total !== null && total !== undefined && Math.abs(total) <= 0.004 && outstanding <= 0.004) {
    return { label: "OUT", pending: false };
  }
  // Half a cent of rounding is not a debt.
  if (outstanding > 0.004) return { label: "OUT (payment pending)", pending: true };
  return { label: "Paid & OUT", pending: false };
}
