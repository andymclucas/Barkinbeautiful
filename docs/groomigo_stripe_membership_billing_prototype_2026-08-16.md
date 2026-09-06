# Groomigo Stripe Membership Billing — Prototype Connection Record

## Current protected state

Groomigo has Stripe integration scaffolding enabled while tenant **1** remains in **prototype mode**. Prototype mode is deliberately non-charging: it does not create Stripe customers, subscriptions, checkout sessions, payment intents, or client communications.

The reconciliation baseline confirms that Barkin Beautiful has **153 active memberships**, all **153** retain their MoeGo membership reference, and there are currently **zero** Stripe customer and subscription identifiers stored locally. This is the expected pre-connection state; it prevents accidental duplicate subscriptions or payments.

## Minimal mapping model

Only Stripe resource identifiers required to connect Groomigo records to Stripe are stored. Card details, webhook payloads, payment amounts, billing addresses and receipt URLs are not stored by Groomigo.

| Groomigo record | Stripe reference stored after a controlled connection | Existing migration reference retained |
|---|---|---|
| Client | `stripe_customer_id` | `moego_client_id` |
| Membership | `stripe_subscription_id` | `moego_membership_id` |
| Membership payment | `stripe_payment_intent_id`, `stripe_invoice_id` | existing gateway payment reference |

## Administrator controls

**Settings → Integrations → Stripe membership billing** now displays the current prototype state, the count of active memberships, the number retaining MoeGo identifiers, and the number reconciled to Stripe. Its protection notice makes clear that no client charge can originate from Groomigo while the tenant remains in prototype mode.

## Required next action before live mapping

The project’s Stripe test sandbox must be claimed by the account owner. Once it is claimed, the controlled connection sequence is: confirm the Stripe account in Settings → Payment; reconcile one existing customer and membership in Stripe test mode; confirm the returned identifiers against the matching MoeGo references; review the webhook result; and only then authorise a separate live-mode transition. The membership retry automation remains paused, and this prototype work does not alter any existing client billing.
