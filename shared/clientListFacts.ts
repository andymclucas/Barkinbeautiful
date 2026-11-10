/**
 * The three facts the clients list was missing.
 *
 * Andy, 10/11/2026: "Add more columns to the clients tab. Client Portal
 * Set Up - Yes / No. Payment Details on file - Yes / No. Membership -
 * (and which current membership they have)."
 *
 * All three are already in the database and none was on the screen, so
 * answering "who still has no card?" meant opening clients one at a
 * time. They are derivations, not new data — which is exactly why they
 * belong in one pure function each rather than being re-derived by
 * whichever query or column happens to need them.
 */

/** `clients.portal_account_status`, as the schema spells it. */
export type PortalAccountStatus =
  | "not_enabled"
  | "setup_pending"
  | "active"
  | "revoked";

/**
 * Whether the client can actually sign in.
 *
 * "setup_pending" is NOT set up. They have been sent a link and have not
 * finished, so the honest answer to "is their portal set up?" is no —
 * and it is the group worth chasing, which is the whole reason the
 * column exists.
 *
 * "revoked" is also no. The account existed and was taken away, so
 * treating it as a yes would put somebody in a list of people who can
 * log in when they cannot.
 */
export function portalIsSetUp(status: string | null | undefined): boolean {
  return (status ?? "").trim() === "active";
}

/** The three states, for a chip that says more than yes or no. */
export function describePortal(
  status: string | null | undefined
): "Yes" | "Invited" | "No" {
  const value = (status ?? "").trim();
  if (value === "active") return "Yes";
  if (value === "setup_pending") return "Invited";
  return "No";
}

export type CardOnFile = {
  stripeDefaultPaymentMethodId?: string | null;
  stripeCardBrand?: string | null;
  stripeCardLast4?: string | null;
};

/**
 * Whether there is a card the salon could actually charge.
 *
 * The payment METHOD id is the test, not the brand or the last four.
 * Those two are a mirror of what Stripe holds so staff can talk about
 * the card on the phone, and a Stripe Link method carries neither — see
 * the test account in .claude/skills/test-on-andys-account, whose card
 * is real and has no brand and no last4. Reading those would report "no
 * card" for a client who has one.
 */
export function hasCardOnFile(client: CardOnFile): boolean {
  return Boolean(client.stripeDefaultPaymentMethodId?.trim());
}

/** "Visa ••4242", or "Yes" when Stripe gave no brand — a Link card does not. */
export function describeCard(client: CardOnFile): string {
  if (!hasCardOnFile(client)) return "No";
  const brand = client.stripeCardBrand?.trim();
  const last4 = client.stripeCardLast4?.trim();
  if (brand && last4) return `${brand} ••${last4}`;
  if (last4) return `••${last4}`;
  return "Yes";
}

/**
 * Which membership statuses count as having one.
 *
 * Andy, 10/11/2026, asked for the CURRENT membership: "Only active
 * memberships." So a paused, cancelled, expired or unpaid membership
 * reads as none. A client who stopped paying in March is not a member
 * now, and a list that says they are is a list that gets them billed
 * for nothing or booked as covered.
 */
export const ACTIVE_MEMBERSHIP_STATUSES: readonly string[] = ["active"];

export function isActiveMembership(status: string | null | undefined): boolean {
  return ACTIVE_MEMBERSHIP_STATUSES.includes((status ?? "").trim());
}

export type MembershipRow = {
  name?: string | null;
  tier?: string | null;
  status?: string | null;
};

/**
 * The membership to show, or null when there is none to show.
 *
 * A client can hold more than one row — the MoeGo import filed two
 * plans under one dog for nine of ten multi-plan clients — so this
 * takes the first ACTIVE one by the order it is given, and names how
 * many others there are rather than silently picking.
 */
export function activeMembership(
  rows: readonly MembershipRow[]
): { label: string; extra: number } | null {
  const active = rows.filter(row => isActiveMembership(row.status));
  if (active.length === 0) return null;
  const first = active[0]!;
  const label =
    first.name?.trim() ||
    (first.tier?.trim() ? titleCase(first.tier.trim()) : "Member");
  return { label, extra: active.length - 1 };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
