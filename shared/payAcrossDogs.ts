/**
 * One payment covering every dog on a booking.
 *
 * Lauren, 23/10/2026: "If they are paying all together do I just put in
 * the total amount here? It says one dogs name that's all."
 *
 * No, she could not. Payment is recorded against one dog and validated
 * against THAT dog's outstanding, so typing $290 against Agnes on a
 * $290 two-dog booking was rejected with "That is more than the $145.00
 * outstanding". The commonest case at the counter — one person, two
 * dogs, one card tap — was the one case the panel could not do.
 *
 * This spreads a single amount across the dogs so the counter enters it
 * once and the ledger still records a row per dog, which is what every
 * report, invoice and membership check already reads.
 *
 * **Fills each dog in turn rather than splitting evenly.** A part
 * payment of $100 on a $290 booking leaves Agnes paid and Shirley
 * owing $45, not both owing $95. Half-paid is a state somebody has to
 * chase twice; paid-and-unpaid is one conversation. Even splitting is
 * still available per dog via the Half and Third buttons.
 */

export type DogBalance = {
  appointmentId: number;
  petName: string | null;
  /** What this dog still owes. Null when the price is not set. */
  outstanding: number | null;
};

export type Allocation = {
  appointmentId: number;
  petName: string | null;
  amount: number;
};

export type AllocationResult =
  | { ok: true; allocations: Allocation[]; total: number; unallocated: number }
  | { ok: false; error: string };

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (cents: number) => cents / 100;
const money = (n: number) => `$${n.toFixed(2)}`;

/** Everything still owed across the booking, ignoring unpriced dogs. */
export function totalOutstanding(dogs: readonly DogBalance[]): number {
  return fromCents(dogs.reduce((sum, d) => sum + toCents(Math.max(0, d.outstanding ?? 0)), 0));
}

/**
 * Split one amount across the dogs, in the order given.
 *
 * Refuses more than the booking owes, the same way the per-dog path
 * refuses more than one dog owes: an overpayment recorded here is money
 * the salon has to find and give back.
 */
export function allocateAcrossDogs(
  amount: string | number | null | undefined,
  dogs: readonly DogBalance[],
): AllocationResult {
  const raw = String(amount ?? "").replace(/[$,\s]/g, "").trim();
  if (raw === "") return { ok: false, error: "Enter an amount" };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return { ok: false, error: "That is not an amount" };

  let remaining = toCents(parsed);
  if (remaining === 0) return { ok: false, error: "Enter an amount other than zero" };
  if (remaining < 0) {
    return { ok: false, error: "Refund one dog at a time, so the right dog is credited" };
  }

  const owing = dogs.filter((d) => (d.outstanding ?? 0) > 0);
  if (owing.length === 0) return { ok: false, error: "This booking is already paid in full" };

  const dueCents = owing.reduce((sum, d) => sum + toCents(d.outstanding!), 0);
  if (remaining > dueCents) {
    return { ok: false, error: `That is more than the ${money(fromCents(dueCents))} outstanding on this booking` };
  }

  const allocations: Allocation[] = [];
  for (const dog of owing) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, toCents(dog.outstanding!));
    if (take <= 0) continue;
    allocations.push({ appointmentId: dog.appointmentId, petName: dog.petName, amount: fromCents(take) });
    remaining -= take;
  }

  return {
    ok: true,
    allocations,
    total: fromCents(toCents(parsed) - remaining),
    unallocated: fromCents(remaining),
  };
}

/** "Agnes $145.00 and Shirley $145.00" — read back before confirming. */
export function describeAllocation(allocations: readonly Allocation[]): string {
  const parts = allocations.map((a) => `${a.petName ?? "this dog"} ${money(a.amount)}`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * What the amount box should show.
 *
 * Andy, 23/10/2026: "don't need to fill in the total - it should auto
 * populate to take the payment." The counter is nearly always taking the
 * whole balance, so typing it is work the screen can do.
 *
 * `edited` is the load-bearing argument. An empty string is a value a
 * person can deliberately choose — they clear the box to retype — and a
 * single string cannot tell that apart from "nobody has typed yet". Treat
 * them the same and the field refills itself under the cursor the moment
 * it is cleared, which is worse than never prefilling at all.
 *
 * Returns "" when nothing is owed rather than "0.00": a zero in the box
 * reads as an amount someone meant to take.
 */
export function prefilledAmount(input: {
  edited: boolean;
  typed: string;
  outstanding: number | null | undefined;
}): string {
  if (input.edited) return input.typed;
  const owing = Number(input.outstanding ?? 0);
  if (!Number.isFinite(owing) || owing <= 0) return "";
  return owing.toFixed(2);
}
