/**
 * What the Memberships page heading and pager count on each tab.
 *
 * Andy, 25/11/2026, with a screenshot: the Failed Payments tab read
 * "221 failed payments memberships" and "Showing 1-50 of 221" with one
 * failed payment on it. Those two lines read the paged membership list,
 * which only filters by status on the four status tabs; on Failed
 * Payments and Accounts Receivable it is every membership.
 *
 * - Status tabs: the paged list's total, with the pager.
 * - Failed Payments: the failed payments themselves, with no pager (the
 *   tab shows them all in one table).
 * - Accounts Receivable: its own panel, so no count and no pager here.
 */
const STATUS_TAB_LABELS: Record<string, string> = {
  active: "active",
  pending_payment: "pending payment",
  paused: "paused",
  cancelled: "cancelled",
  expired: "expired",
};

export function membershipTabCount(input: {
  tab: string;
  listTotal: number;
  failedPaymentCount: number;
}): { heading: string | null; showPager: boolean } {
  const label = STATUS_TAB_LABELS[input.tab];
  if (label) {
    return { heading: `${input.listTotal} ${label} ${plural(input.listTotal)}`, showPager: true };
  }
  if (input.tab === "failed_payments") {
    const n = input.failedPaymentCount;
    return { heading: `${n} failed ${n === 1 ? "payment" : "payments"}`, showPager: false };
  }
  return { heading: null, showPager: false };
}

function plural(n: number) {
  return n === 1 ? "membership" : "memberships";
}
