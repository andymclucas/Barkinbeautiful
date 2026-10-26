/**
 * A discount on one line of a bill — an add-on, or the whole total.
 *
 * Andy, 27/10/2026: "Add in option to add manual discount using a dollar
 * figure for add-ons, plus the overall total if required. So each add-on
 * needs to be able to be discounted with either a percentage or a
 * manually entered dollar figure."
 *
 * The existing appointmentDiscount.ts handles the GROOM price and offers
 * four fixed percentages. This is the general version: either a percent
 * or a cash amount, on any line. It deliberately keeps two rules from
 * that module, because both were learned rather than chosen:
 *
 *  - **Round the discount, then subtract.** Rounding the net instead can
 *    leave gross − net ≠ the figure the staff member said out loud.
 *  - **A discount needs a reason.** Money comes off the bill and nobody
 *    can say why a month later otherwise.
 *
 * A line carries a percent OR an amount, never both. Storing both invites
 * the question of which wins, and every answer to that is a surprise to
 * somebody.
 */

export const MAX_DISCOUNT_REASON = 200;

const toCents = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (cents: number): string => (Math.round(cents) / 100).toFixed(2);

export type LineDiscount =
  | { kind: "percent"; value: number }
  | { kind: "amount"; value: number }
  | null;

export type LineDiscountBreakdown = {
  grossCents: number;
  discountCents: number;
  netCents: number;
  discount: LineDiscount;
};

/**
 * Take a discount off a line.
 *
 * Never takes off more than the line costs: a $20 discount on a $15 add-on
 * settles at $15, not at minus five. A negative line is not something the
 * counter can produce, and inventing one here would quietly turn an
 * invoice into a refund.
 */
export function applyLineDiscount(
  gross: string | number | null | undefined,
  discount: LineDiscount,
): LineDiscountBreakdown {
  const grossCents = Math.max(0, toCents(gross));
  if (!discount || grossCents === 0) {
    return { grossCents, discountCents: 0, netCents: grossCents, discount: null };
  }
  const raw = discount.kind === "percent"
    ? Math.round((grossCents * discount.value) / 100)
    : toCents(discount.value);
  const discountCents = Math.min(Math.max(0, raw), grossCents);
  return { grossCents, discountCents, netCents: grossCents - discountCents, discount };
}

export type LineDiscountValidation =
  | { ok: true; discount: LineDiscount; reason: string | null }
  | { ok: false; error: string };

/**
 * Check a discount before it is stored.
 *
 * `gross` is optional but worth passing: it is the only way to catch
 * "$50 off" typed against a $35 add-on at the moment somebody types it,
 * rather than silently clamping later.
 */
export function validateLineDiscount(input: {
  kind: "percent" | "amount" | null | undefined;
  value: string | number | null | undefined;
  reason: string | null | undefined;
  gross?: string | number | null | undefined;
}): LineDiscountValidation {
  const reason = (input.reason ?? "").trim();

  // Clearing a discount. A leftover reason would be misleading.
  if (!input.kind || input.value === null || input.value === undefined || input.value === "") {
    return { ok: true, discount: null, reason: null };
  }

  const numeric = typeof input.value === "number"
    ? input.value
    : Number(String(input.value).replace(/[$,\s%]/g, ""));
  if (!Number.isFinite(numeric)) return { ok: false, error: "That is not a number." };
  if (numeric <= 0) return { ok: false, error: "A discount has to be more than zero." };

  if (input.kind === "percent") {
    if (numeric > 100) return { ok: false, error: "A discount cannot be more than 100%." };
  } else {
    const grossCents = toCents(input.gross);
    if (grossCents > 0 && toCents(numeric) > grossCents) {
      return { ok: false, error: `That is more than the $${fromCents(grossCents)} on this line.` };
    }
  }

  if (!reason) return { ok: false, error: "Please say why this discount is being applied." };
  if (reason.length > MAX_DISCOUNT_REASON) return { ok: false, error: "That reason is too long." };

  // Percent to 2dp, amount to the cent — both as numbers, so the stored
  // value is the one that was agreed rather than a rounded display.
  const value = input.kind === "percent"
    ? Math.round(numeric * 100) / 100
    : Math.round(numeric * 100) / 100;
  return { ok: true, discount: { kind: input.kind, value }, reason };
}

/** "20% off ($7.00)" or "$5.00 off" — what shows beside the line. */
export function describeLineDiscount(
  discount: LineDiscount,
  discountCents?: number,
): string | null {
  if (!discount) return null;
  if (discount.kind === "percent") {
    const money = discountCents === undefined ? "" : ` ($${fromCents(discountCents)})`;
    return `${discount.value}% off${money}`;
  }
  return `$${discount.value.toFixed(2)} off`;
}

/** Read the stored pair back into a discount. Both set is treated as none. */
export function discountFromColumns(
  percent: string | number | null | undefined,
  amount: string | number | null | undefined,
): LineDiscount {
  const hasPercent = percent !== null && percent !== undefined && Number(percent) > 0;
  const hasAmount = amount !== null && amount !== undefined && Number(amount) > 0;
  // Both set should be impossible — validateLineDiscount returns one or
  // the other — so it means the row was written by something else, and
  // guessing which the client agreed to is worse than charging full.
  if (hasPercent === hasAmount) return null;
  return hasPercent
    ? { kind: "percent", value: Number(percent) }
    : { kind: "amount", value: Number(amount) };
}
