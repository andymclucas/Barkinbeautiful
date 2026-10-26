/**
 * Cash handed over at the counter, and the change that goes back.
 *
 * Lauren, 27/10/2026: a $110 groom, the client paid with $200 cash, and
 * the panel refused it — "That is more than the $110.00 outstanding" —
 * so the payment could not be recorded at all while the client stood
 * there. The refusal is right for a card, where you cannot charge more
 * than is owed. It is wrong for cash, where handing over more than the
 * bill is the normal way to pay.
 *
 * **The ledger records what the salon KEPT, not what was handed over.**
 * $200 in and $90 out is $110 of revenue. Recording the $200 would put
 * $90 of money the salon does not have into every revenue report, and
 * would mark the booking overpaid. So `applied` is what gets written as
 * the payment and `change` is only ever displayed.
 */

const toCents = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === "") return NaN;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const fromCents = (cents: number): number => Math.round(cents) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;

export type CashTender =
  | {
      ok: true;
      /** What to record as the payment. Never more than is owed. */
      applied: number;
      /** What to hand back. Zero unless they over-tendered. */
      change: number;
      /** Whether this settles the booking. */
      settles: boolean;
    }
  | { ok: false; error: string };

/**
 * Work out the payment and the change for a cash tender.
 *
 * Under-tendering is a part payment, not an error: handing over $50 of a
 * $110 bill is something the counter does, and it already worked.
 */
export function cashTender(input: {
  tendered: string | number | null | undefined;
  outstanding: number | null | undefined;
}): CashTender {
  const tendered = toCents(input.tendered);
  if (Number.isNaN(tendered)) return { ok: false, error: "That is not an amount" };
  if (tendered === 0) return { ok: false, error: "Enter an amount other than zero" };
  // Handing over a negative amount of cash is not a thing. Refunds have
  // their own path.
  if (tendered < 0) return { ok: false, error: "Cash tendered cannot be negative" };

  const outstanding = input.outstanding === null || input.outstanding === undefined
    ? null
    : Math.round(input.outstanding * 100);
  if (outstanding !== null && outstanding <= 0) {
    return { ok: false, error: "This booking is already paid in full" };
  }

  // With no figure to bill against, every cent is applied — there is
  // nothing to say it is too much.
  const applied = outstanding === null ? tendered : Math.min(tendered, outstanding);
  return {
    ok: true,
    applied: fromCents(applied),
    change: fromCents(tendered - applied),
    settles: outstanding !== null && applied >= outstanding,
  };
}

/** "Change $90.00" — what the counter reads out. Empty when there is none. */
export function describeChange(change: number): string {
  return change > 0 ? `Change ${money(change)}` : "";
}

/** Whether a method can be over-tendered. Only physical cash can. */
export function acceptsOverTender(method: string): boolean {
  return method === "cash";
}
