# Stripe Sandbox Webhook Endpoint Audit — 27 August 2026

## Read-only result

The Stripe test account currently contains one enabled test-mode webhook endpoint. It is configured for the Groomigo development webhook route and subscribes to `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, and customer-subscription lifecycle events. No signing secret was read, stored or displayed.

## Reconciliation finding

No duplicate Stripe sandbox endpoint was returned by the Stripe API. The earlier concern about a manually created duplicate destination and mismatched signing secret is therefore not present in the current test account configuration. The successful isolated Checkout validation independently confirmed that the registered endpoint accepted a completed-checkout event and reconciled the linked test invoice.

## Decision

No endpoint was deleted, re-registered or otherwise changed. This avoids disturbing a verified test-mode payment webhook. Any future production webhook configuration must use the published production Groomigo URL, a separately managed production signing secret, and a deliberate approval before live client billing is enabled.
