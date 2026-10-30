/**
 * Is this a URL Stripe itself serves?
 *
 * A payment button is the single most impersonatable thing in an email,
 * so the destination is verified rather than trusted. Both the card-link
 * email and the invoice email put a URL in front of a client that is
 * supposed to be Stripe's; neither should be able to mail anything else,
 * whatever ends up in the database column it came from.
 *
 * This was `isAcceptableCardLink` inside `cardLinkEmail.ts`. It moved
 * here when the invoice email needed the same check — one copy, because
 * the copy that drifts is the one nobody is looking at.
 *
 * The subdomain rule is deliberately a suffix match on `.stripe.com`
 * rather than a list: Checkout lives on `checkout.stripe.com`, hosted
 * invoices on `invoice.stripe.com`, and Connect uses its own hosts. A
 * fixed list would have to be edited every time Stripe adds one, and
 * the failure mode of a stale list is a link that silently vanishes
 * from a client's bill.
 */
export function isStripeHostedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  // `endsWith(".stripe.com")` alone would accept "evil-stripe.com" only
  // if it ended in ".stripe.com", which it cannot — but it WOULD accept
  // "stripe.com.attacker.net" without the leading dot, so the dot is
  // load-bearing and the bare host is matched separately.
  return parsed.hostname === "stripe.com" || parsed.hostname.endsWith(".stripe.com");
}
