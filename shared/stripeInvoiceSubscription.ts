/**
 * Which subscription produced this invoice.
 *
 * Stripe MOVED this. Up to API version 2025-03-31 the invoice carried a
 * top-level `subscription`; after it, the same id lives at
 * `parent.subscription_details.subscription`, and the old field is simply
 * absent. The SDK here (22.5, 2026-07-29.dahlia) only knows the new shape.
 *
 * Reading only one of them is a silent failure, not a crash: an unmatched
 * invoice event returns 200 to Stripe and does nothing at all - no payment
 * recorded, no Dashboard alert, no retry scheduled - so weekly billing would
 * look configured and heal nothing. Both paths are read, because the webhook
 * endpoint's API version is chosen in the Stripe dashboard and can be moved
 * by someone who has no idea this function exists.
 */
export function subscriptionIdOf(invoice: unknown): string | null {
  const parent = (invoice as {
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
  }).parent;
  const fromParent = parent?.subscription_details?.subscription;
  const legacy = (invoice as { subscription?: string | { id?: string } | null }).subscription;
  const value = fromParent ?? legacy;
  if (!value) return null;
  return typeof value === "string" ? value : (value.id ?? null);
}

/**
 * The subscription's metadata as Stripe snapshotted it onto the invoice.
 *
 * Moved in the same API change as the id above, so both homes are read:
 * `parent.subscription_details.metadata` now, `subscription_details.metadata`
 * before. Empty when the invoice has neither — a one-off invoice, or an
 * API version that does not copy it — and the caller must treat empty as
 * "cannot tell", never as a match.
 */
export function subscriptionMetadataOf(invoice: unknown): Record<string, string> {
  const shape = invoice as {
    parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null;
    subscription_details?: { metadata?: Record<string, string> | null } | null;
  };
  return shape.parent?.subscription_details?.metadata
    ?? shape.subscription_details?.metadata
    ?? {};
}
