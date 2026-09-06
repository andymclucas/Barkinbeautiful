# Stripe Sandbox Assessment — 27 August 2026

## Scope and safeguards

This assessment was limited to reading Groomigo configuration, schema and database coverage. It did not create a Stripe customer, subscription, invoice, Checkout Session, payment intent, webhook event or client message. It did not modify client, membership, invoice or payment records.

## Current evidence

| Check | Result |
|---|---:|
| Configured Stripe secret mode | `sk_test_` test mode |
| Active Groomigo memberships | 153 |
| Active memberships with retained MoeGo membership identifier | 153 |
| Active memberships mapped to a Stripe subscription | 0 |
| Groomigo clients mapped to a Stripe customer | 0 |
| Focused Stripe regression tests | 4 passed |

The retained MoeGo membership IDs provide a safe legacy reference within Groomigo, but they are not Stripe subscription identifiers. No direct legacy-to-Stripe mapping can be inferred without a verified Stripe-side record match, so no mapping was attempted.

## Test-only next step requiring confirmation

To validate the complete Checkout and webhook route, Groomigo would need to create one isolated, clearly labelled test invoice and start a Stripe **test-mode** Checkout Session. This would create a Stripe test customer and a test checkout object and, after test completion, write a payment audit record for that isolated invoice. It would not charge real money or message a client, but it is still a persistent payment-system action. Do not perform this step without explicit confirmation.

## Authorised test execution status

Following explicit authorisation, Groomigo created the isolated `TEST-STRIPE-20260827-01` A$1.00 test-mode invoice and a corresponding Stripe test Checkout Session. The associated client is inactive, carries no contact details, and is labelled as a system test record. A subsequent read-only Stripe check found the session still `open` and `unpaid`; no webhook event, payment or membership record has been written. The same open session should be resumed rather than creating another.

The authorised test was subsequently completed. The invoice is marked `paid` with payment method `stripe`, and the audit table contains the corresponding `checkout.session.completed` event for invoice `90002`, as well as Stripe's `payment_intent.succeeded` event. The session has no membership relationship, so no membership payment, membership ledger entry or client booking status was created or changed.

The inactive system test client and the fully labelled paid invoice are retained as an explicit audit record. They must not be treated as a salon client, appointment, membership, receivable or operational revenue record. No additional Checkout session was created.

## Production position

Stripe remains an inactive prototype for the current salon. No live Stripe key, automatic charge, automatic payment retry, client SMS or client email has been enabled.
