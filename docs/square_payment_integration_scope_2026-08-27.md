# Square Payment Integration Scope — 27 August 2026

## Purpose

This is a planning document only. It does not connect a Square account, request credentials, create a payment, migrate a customer, alter a membership, or enable any automatic communication. Groomigo’s existing Stripe configuration remains restricted to the verified test-mode prototype.

## Integration boundary

| Area | Planned Square behaviour | Safeguard |
|---|---|---|
| Merchant connection | Administrator-controlled Square OAuth connection | Require explicit administrator authorisation before connection or re-connection |
| Card and wallet payments | Use Square-hosted or Square-managed payment collection | Groomigo must never store card data or payment credentials |
| Cash and EFTPOS | Permit staff to record the existing cash or terminal transaction reference | Record only the selected method, amount, staff member and external receipt reference |
| Memberships | Store a Square customer/subscription reference separately from legacy MoeGo and Stripe references | Do not infer or overwrite legacy membership data or another gateway’s IDs |
| One-off invoices | Attach a Square payment record to one Groomigo invoice | Reconcile by immutable internal invoice ID and provider event ID only |
| Webhooks | Verify signed Square payment and subscription events | Enforce idempotency and retain provider event metadata without raw card data |

## Data migration and coexistence

The existing `moego_membership_id`, `stripe_customer_id` and `stripe_subscription_id` fields must remain historical references. Square mapping must use dedicated Square identifiers or an explicitly versioned gateway-reference model. No legacy MoeGo record should be mapped solely by client name, email or a matching amount: each mapping needs an explicit verified provider identifier.

During a future staged rollout, Stripe must remain test-only and must not issue live collection requests. A single gateway should be designated as the active collection method per invoice or membership to avoid duplicate collection. Cash and EFTPOS entries remain manual records, not automated debits.

## Required sandbox acceptance tests

1. Connect a Square **sandbox** seller account only after administrator approval.
2. Create one clearly labelled non-client test invoice and complete one sandbox card payment.
3. Verify a signed payment-completed webhook updates only the linked test invoice.
4. Verify a controlled failed payment does not change a real membership or trigger a client message.
5. Record a cash/EFTPOS entry with an external reference and confirm it cannot be processed again as an online payment.
6. Re-run the full Groomigo regression, type-check and production build before any production proposal.

## Production gate

Before any live Square activation, the administrator must explicitly approve the seller account, accepted payment methods, client communication policy, failed-payment handling, test evidence and the exact billing population to be migrated. This scope alone grants no authority to enable live collection.
