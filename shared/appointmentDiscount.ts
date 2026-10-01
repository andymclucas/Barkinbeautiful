/**
 * Staff discounts on a grooming appointment.
 *
 * The model deliberately reuses the two price columns the schema already
 * defines: `grossPrice` is what was charged before any discount, `price` is
 * what the client actually pays. Everything downstream — the family price
 * breakdown, the split-bill panel, the analytics expected-revenue sum —
 * already reads `price`, so a discount applied here flows through to
 * multi-dog families and split bills without those modules changing at all.
 *
 * Money is handled in integer cents, as everywhere else that touches money
 * in this app. Working in dollars means 15% of $47.50 is 7.125 and the
 * rounding lands wherever the floating point felt like it.
 */

/** The only discounts the salon offers. Not a free-text percentage. */
export const DISCOUNT_PERCENTS = [5, 10, 15, 20] as const;
export type DiscountPercent = (typeof DISCOUNT_PERCENTS)[number];

export const MAX_DISCOUNT_REASON = 200;

export function isValidDiscountPercent(value: unknown): value is DiscountPercent {
  return typeof value === "number" && (DISCOUNT_PERCENTS as readonly number[]).includes(value);
}

export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type DiscountBreakdown = {
  /** Charged before the discount. */
  grossCents: number;
  /** Taken off. */
  discountCents: number;
  /** What the client pays. */
  netCents: number;
  percent: DiscountPercent | null;
};

/**
 * Round the DISCOUNT, then subtract — rather than rounding the net.
 *
 * Both are defensible to a penny, but rounding the discount means the
 * amount taken off is a clean figure a staff member can say out loud
 * ("I've taken $7.13 off"), and gross − discount always reconciles exactly.
 * Rounding the net can leave gross − net ≠ the stated discount.
 */
export function applyDiscount(
  grossPrice: string | number | null | undefined,
  percent: DiscountPercent | null | undefined,
): DiscountBreakdown {
  const grossCents = Math.max(0, toCents(grossPrice));
  if (!isValidDiscountPercent(percent)) {
    return { grossCents, discountCents: 0, netCents: grossCents, percent: null };
  }
  const discountCents = Math.round((grossCents * percent) / 100);
  return {
    grossCents,
    discountCents,
    netCents: Math.max(0, grossCents - discountCents),
    percent,
  };
}

export type DiscountInput = {
  percent: number | null | undefined;
  reason: string | null | undefined;
};

export type DiscountValidation =
  | { ok: true; percent: DiscountPercent | null; reason: string | null }
  | { ok: false; error: string };

/**
 * A discount without a reason is the thing this feature exists to prevent:
 * money comes off the bill and nobody can say why a month later.
 */
export function validateDiscount(input: DiscountInput): DiscountValidation {
  const hasPercent = input.percent !== null && input.percent !== undefined;
  const reason = (input.reason ?? "").trim();

  if (!hasPercent) {
    // Removing a discount. A leftover reason would be misleading.
    return { ok: true, percent: null, reason: null };
  }
  if (!isValidDiscountPercent(input.percent)) {
    return { ok: false, error: `Choose a discount of ${DISCOUNT_PERCENTS.join("%, ")}%.` };
  }
  if (!reason) {
    return { ok: false, error: "Please say why this discount is being applied." };
  }
  if (reason.length > MAX_DISCOUNT_REASON) {
    return { ok: false, error: "That reason is too long." };
  }
  return { ok: true, percent: input.percent, reason };
}

/** "15% off — long-standing client ($7.13)" */
export function describeDiscount(
  percent: number | null | undefined,
  reason: string | null | undefined,
  discountCents?: number,
): string | null {
  if (!isValidDiscountPercent(percent)) return null;
  const amount = typeof discountCents === "number" ? ` ($${fromCents(discountCents)})` : "";
  const why = (reason ?? "").trim();
  return `${percent}% off${why ? ` — ${why}` : ""}${amount}`;
}
