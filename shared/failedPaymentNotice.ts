/**
 * How a failed membership payment reads in the notifications bell.
 *
 * Failed payments used to be visible only if someone opened the Memberships
 * page and clicked the Failed Payments tab. Put beside missed calls and
 * inbound texts they would simply be lost, which is why they get their own
 * section — money that did not arrive is not the same kind of thing as a
 * voicemail, and it does not stop mattering because nobody looked.
 */

export type FailedPaymentRow = {
  membershipId: number;
  membershipName?: string | null;
  failedCount?: number | null;
  lastFailedAt?: Date | string | number | null;
  suspended?: boolean | null;
  clientFirstName?: string | null;
  clientLastName?: string | null;
  petName?: string | null;
};

/** "Toni Constantini · Lily", or whatever part of that we actually have. */
export function failedPaymentHeadline(row: FailedPaymentRow): string {
  const name = [row.clientFirstName, row.clientLastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const pet = (row.petName ?? "").trim();
  if (name && pet) return `${name} · ${pet}`;
  if (name) return name;
  if (pet) return pet;
  return row.membershipName?.trim() || `Membership ${row.membershipId}`;
}

/**
 * "Payment failed 3 times · bookings suspended".
 *
 * The attempt count matters: one failure is usually an expired card, several
 * means the client has stopped paying and nobody noticed.
 */
export function failedPaymentDetail(row: FailedPaymentRow): string {
  const count = Math.max(0, Math.trunc(Number(row.failedCount ?? 0)));
  const attempts =
    count <= 1 ? "Payment failed" : `Payment failed ${count} times`;
  return row.suspended === true ? `${attempts} · bookings suspended` : attempts;
}

/**
 * Worst first: suspended before not suspended, then most failures, then most
 * recent. A client who can no longer book is the one to ring today.
 */
export function sortFailedPayments<T extends FailedPaymentRow>(rows: readonly T[]): T[] {
  const time = (value: FailedPaymentRow["lastFailedAt"]) => {
    if (value === null || value === undefined) return 0;
    const ms = new Date(value as string).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };
  return [...rows].sort((a, b) => {
    if ((b.suspended === true ? 1 : 0) !== (a.suspended === true ? 1 : 0)) {
      return (b.suspended === true ? 1 : 0) - (a.suspended === true ? 1 : 0);
    }
    const byCount = Number(b.failedCount ?? 0) - Number(a.failedCount ?? 0);
    if (byCount !== 0) return byCount;
    return time(b.lastFailedAt) - time(a.lastFailedAt);
  });
}
