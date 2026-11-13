/**
 * One payment for a household's memberships.
 *
 * Andy, 13/11/2026: "Build in the ability to take multi-dog family
 * membership billing as one payment rather than 2. They have two dogs,
 * which we want to keep separate in case one of them changes weight
 * class."
 *
 * ## How it is built
 *
 * Each dog keeps its OWN membership row, with its own plan, price and
 * weight class. Nothing about a membership changes. What changes is the
 * Stripe side: instead of one subscription per membership, the household
 * has ONE subscription with one line per membership, so the client sees
 * a single charge and a single receipt. Several membership rows then
 * carry the same `stripeSubscriptionId`, and that shared id is the whole
 * record of "billed together" — there is no extra table.
 *
 * Keeping the rows separate is what makes a weight-class change simple:
 * stop billing for that one dog (its line comes off the payment and the
 * others carry on), change its plan, and add it back.
 *
 * ## What follows from sharing a payment
 *
 * A payment succeeds or fails as a whole, so everything that is about
 * the PAYMENT applies to every membership on it: a failed charge, a
 * retry, a pause. Everything that is about the DOG stays per membership.
 * The money is booked per membership, split by each one's own price, so
 * revenue by plan still adds up.
 */

/**
 * Whether the shared payment is limited to test memberships (`is_test = 1`).
 *
 * It was, from the day it shipped (13/11/2026) until a $2 test on Andy's
 * own record passed the same day: one payment, booked per membership, a
 * membership taken off and added back, and the payment cancelled. Andy
 * then said "switch it on". Kept as a switch rather than deleted so it
 * can be turned back to test-only in one line if a shared payment ever
 * misbehaves. The failed-payment and pause paths have not been run live.
 */
export const FAMILY_BILLING_TEST_ONLY: boolean = false;

export type FamilyBillingCandidate = {
  id: number;
  clientId: number | null;
  tenantId: number | null;
  status: string;
  stripeSubscriptionId: string | null;
  /** "weekly" | "fortnightly" | "monthly", from resolveChargePlan. Null when it cannot be billed. */
  cycle: string | null;
  amountCents: number;
};

export type FamilyBillingPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      /** The subscription the others join, or null to create a new one. */
      existingSubscriptionId: string | null;
      /** Memberships that need a line adding (or creating). */
      toAdd: FamilyBillingCandidate[];
      /** Memberships already on `existingSubscriptionId`. */
      alreadyOn: FamilyBillingCandidate[];
      totalCents: number;
    };

/**
 * Whether these memberships can share one payment, and how.
 *
 * Refuses rather than guesses on every mismatch: a wrong grouping here
 * charges a real card the wrong amount at the wrong cadence.
 */
export function planFamilyBilling(candidates: readonly FamilyBillingCandidate[]): FamilyBillingPlan {
  if (candidates.length < 2) return { ok: false, error: "Pick at least two memberships to bill together" };
  if (new Set(candidates.map((c) => c.id)).size !== candidates.length) {
    return { ok: false, error: "The same membership was picked twice" };
  }
  const [first] = candidates;
  if (!first.clientId) return { ok: false, error: "This membership has no client attached" };
  if (candidates.some((c) => c.clientId !== first.clientId || (c.tenantId ?? 1) !== (first.tenantId ?? 1))) {
    return { ok: false, error: "Only memberships belonging to the same client can be billed together" };
  }
  if (candidates.some((c) => !c.cycle || c.amountCents <= 0)) {
    return { ok: false, error: "One of these memberships has no price or a billing cycle Stripe cannot take" };
  }
  if (new Set(candidates.map((c) => c.cycle)).size > 1) {
    return { ok: false, error: "These memberships bill on different cycles, so they cannot share one payment. Put them on the same cycle first." };
  }

  const alreadyOn = candidates.filter((c) => c.stripeSubscriptionId);
  const toAdd = candidates.filter((c) => !c.stripeSubscriptionId);
  const subscriptions = new Set(alreadyOn.map((c) => c.stripeSubscriptionId));
  if (subscriptions.size > 1) {
    return { ok: false, error: "Two of these are already billing separately. Stop billing on one of them first, then add it to the other." };
  }
  if (toAdd.length === 0) return { ok: false, error: "These memberships are already billed together" };

  // The same test startMembershipSubscription applies to one membership.
  const startable = (c: FamilyBillingCandidate) => c.status === "active" || c.status === "pending_payment";
  const blocked = toAdd.find((c) => !startable(c));
  if (blocked) {
    return {
      ok: false,
      error: blocked.status === "paused"
        ? "One of these memberships is paused. Resume it before starting billing."
        : `One of these memberships is ${blocked.status}, so billing cannot be started`,
    };
  }
  // Joining a payment that is itself failing or paused would hide the
  // new dog's first charge behind somebody else's problem.
  if (alreadyOn.some((c) => c.status !== "active")) {
    return { ok: false, error: "The payment these would join is paused or has a failed charge. Sort that out first." };
  }

  return {
    ok: true,
    existingSubscriptionId: alreadyOn[0]?.stripeSubscriptionId ?? null,
    toAdd,
    alreadyOn,
    totalCents: candidates.reduce((sum, c) => sum + c.amountCents, 0),
  };
}

/**
 * Split one invoice's cents across the memberships on it.
 *
 * In proportion to each membership's own price, which is exact whenever
 * the invoice is the plain weekly charge. When it is not (a part-week, a
 * credit, a price changed mid-cycle) the proportions still hold and the
 * odd cents go to the first membership, so the parts ALWAYS add back up
 * to what Stripe actually took. Books that do not reconcile to the bank
 * are worse than a cent on the wrong dog.
 */
export function splitInvoiceCents(
  totalCents: number,
  shares: ReadonlyArray<{ membershipId: number; expectedCents: number }>,
): Array<{ membershipId: number; cents: number }> {
  if (shares.length === 0) return [];
  const total = Math.max(0, Math.round(totalCents));
  const weight = shares.reduce((sum, s) => sum + Math.max(0, s.expectedCents), 0);
  const parts = shares.map((s) => ({
    membershipId: s.membershipId,
    cents: weight > 0
      ? Math.floor((total * Math.max(0, s.expectedCents)) / weight)
      : Math.floor(total / shares.length),
  }));
  parts[0].cents += total - parts.reduce((sum, p) => sum + p.cents, 0);
  return parts;
}

/**
 * The unique key that stops one invoice being booked twice.
 *
 * A membership billed alone keeps the bare invoice id, exactly as before,
 * so every existing row and the unique index on it are untouched. A
 * shared invoice books one row PER MEMBERSHIP, so each needs its own key.
 */
export function paidInvoiceKeyFor(invoiceId: string, membershipId: number, shared: boolean): string {
  return shared ? `${invoiceId}:${membershipId}` : invoiceId;
}

/** "$34.00" from cents, for the one-payment label. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── What the Memberships tab offers ─────────────────────────────────────────

export type FamilyBillingRow = {
  id: number;
  status: string;
  stripeSubscriptionId?: string | null;
  billingCycle?: string | null;
  billingCycleWeeks?: number | null;
  pricePerCycle: string | number | null;
  petName?: string | null;
  name?: string | null;
  isTest?: boolean | null;
};

export type FamilyBillingOffer = {
  /** Every membership that would be on the payment afterwards. */
  membershipIds: number[];
  /** True when the others join a payment that is already running. */
  joinsExisting: boolean;
  /** Just the ones being added now. */
  adding: FamilyBillingRow[];
  /** All of them, for the "one payment of $X for A and B" line. */
  all: FamilyBillingRow[];
  totalCents: number;
};

const cents = (price: string | number | null) => Math.round(Number(price ?? 0) * 100);
const cadence = (row: FamilyBillingRow) => `${row.billingCycle ?? "weekly"}:${row.billingCycleWeeks ?? 1}`;

/**
 * Whether to offer "bill together" on a client's Memberships tab, and for
 * which memberships. Null means there is nothing to offer.
 *
 * Deliberately stricter than the server. It only offers the two clear
 * cases, and only when every membership involved is on the same cadence:
 *   - two or more memberships that are not billing yet;
 *   - one or more not billing yet, beside exactly one live payment.
 * Anything murkier is left to be sorted out one membership at a time.
 * The total shown assumes the plain weekly or fortnightly price, which
 * is what those cadences charge.
 */
export function familyBillingOffer(rows: readonly FamilyBillingRow[]): FamilyBillingOffer | null {
  const notBilling = rows.filter((r) =>
    !r.stripeSubscriptionId && (r.status === "active" || r.status === "pending_payment") && cents(r.pricePerCycle) > 0);
  const live = rows.filter((r) => r.stripeSubscriptionId && r.status === "active");
  const liveSubscriptions = new Set(live.map((r) => r.stripeSubscriptionId));
  if (notBilling.length === 0 || liveSubscriptions.size > 1) return null;
  if (liveSubscriptions.size === 0 && notBilling.length < 2) return null;
  // A payment that is failing or paused is not one to add a dog to.
  if (rows.some((r) => r.stripeSubscriptionId && r.status !== "active" && r.status !== "cancelled" && r.status !== "expired")) return null;

  const all = [...live, ...notBilling];
  if (FAMILY_BILLING_TEST_ONLY && all.some((r) => !r.isTest)) return null;
  if (all.some((r) => r.billingCycle === "monthly")) return null;
  if (new Set(all.map(cadence)).size > 1) return null;
  return {
    membershipIds: all.map((r) => r.id),
    joinsExisting: live.length > 0,
    adding: notBilling,
    all,
    totalCents: all.reduce((sum, r) => sum + cents(r.pricePerCycle), 0),
  };
}

/** The other memberships on the same payment as this one. */
export function billedTogetherWith<T extends FamilyBillingRow>(row: FamilyBillingRow, rows: readonly T[]): T[] {
  if (!row.stripeSubscriptionId) return [];
  return rows.filter((other) => other.id !== row.id && other.stripeSubscriptionId === row.stripeSubscriptionId);
}

// ─── Showing a shared payment as what was actually paid ──────────────────────

export type PaymentRow = {
  id: number;
  amount: string | number;
  status: string;
  paidAt: Date | string | null;
  membershipName: string | null;
  petName?: string | null;
  stripeInvoiceId?: string | null;
};

export type PaymentGroup = {
  /** Stable key for the list. */
  key: string;
  status: string;
  paidAt: Date | string | null;
  /** What Stripe took (or tried to take), in cents. */
  totalCents: number;
  /** One line per dog. A payment for one membership has exactly one. */
  lines: Array<{ id: number; petName: string | null; membershipName: string | null; cents: number }>;
};

/**
 * The client's payments as the client was charged.
 *
 * Andy, 13/11/2026: one $34.00 family payment was listed as two $17.00
 * payments. That is how it is BOOKED, one row per membership, so revenue
 * by plan adds up. It is not what happened on the card. Rows from the
 * same Stripe invoice with the same outcome are one payment: shown once,
 * with the total that was taken and each dog's share under it.
 *
 * Order is kept as given (newest first from the server). Rows with no
 * invoice id, such as a hand-recorded payment, are never merged.
 */
export function groupPayments(rows: readonly PaymentRow[]): PaymentGroup[] {
  const groups: PaymentGroup[] = [];
  const byKey = new Map<string, PaymentGroup>();
  for (const row of rows) {
    const rowCents = Math.round(Number(row.amount ?? 0) * 100);
    const line = { id: row.id, petName: row.petName ?? null, membershipName: row.membershipName, cents: rowCents };
    const key = row.stripeInvoiceId ? `${row.stripeInvoiceId}:${row.status}` : `row:${row.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.totalCents += rowCents;
      existing.paidAt = existing.paidAt ?? row.paidAt;
      continue;
    }
    const group: PaymentGroup = { key, status: row.status, paidAt: row.paidAt, totalCents: rowCents, lines: [line] };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}
