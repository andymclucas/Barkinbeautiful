# Groomigo Stripe Payment Options — Test Mode

## Available administrator workflow

Groomigo now provides a Stripe-backed payment path for any reviewed membership arrears invoice. In **Memberships → Accounts Receivable**, the administrator first records any missing delivered-groom values and verified payments, creates a draft arrears invoice, then selects **Stripe test checkout**. Groomigo opens Stripe’s hosted Checkout in a separate tab; it does not email the client or charge a saved card.

The hosted payment page collects card and compatible wallet details directly in Stripe. Groomigo stores no card number, CVV, expiry date, payment-method details, raw webhook payload or Stripe secret. It only retains the minimum identifiers needed to reconcile the payment: Stripe Customer ID on the client, Checkout Session ID and URL on the invoice, payment-intent reference on a membership payment, and Stripe event ID in an idempotent audit record.

## Payment status and non-card payments

When Stripe confirms a successful hosted Checkout, Groomigo marks the linked invoice paid, records Stripe as the payment method, and creates matching membership payment and ledger entries. A Stripe failed-payment event moves the linked membership into pending payment status and increments the failed-payment count. The existing Accounts Receivable dialog also now records **cash received**, verified manual entries and imported MoeGo payments as auditable alternatives.

## Test-mode safeguards

The tenant remains in prototype mode and the server only accepts Stripe **test-mode** server keys for hosted Checkout creation. Payment retries remain paused. No checkout URL is emailed automatically, no client invoice is sent automatically, and no live payment is collected by this release. The Stripe webhook endpoint is `/api/stripe/webhook`; it verifies Stripe signatures against the configured webhook secret and acknowledges `evt_test_` verification events without changing Groomigo data.

## Controlled go-live checklist

| Required before live collection | Why it matters |
|---|---|
| Claim and complete Stripe account verification | Stripe must make live collection available. |
| Configure a live webhook endpoint in Stripe Developers | Keeps invoice and membership statuses synchronised. |
| Change the tenant from prototype to live only after an approved test | Prevents accidental collection while staff are still reconciling MoeGo records. |
| Verify the Resend sender domain before emailing any invoice link | Allows invitation and invoice communications to be delivered from an authenticated salon sender. |

The standard Stripe test card `4242 4242 4242 4242` may be used only for a deliberately created test Checkout, never for a client record.

## Current gateway status

The completed Stripe work remains an **inactive sandbox prototype**. Groomigo does not use it for live collection, automatic invoices, client email, or stored payment methods. Further gateway activation is on hold while the planned Square payment implementation is scoped, so no Stripe live-account connection should be installed or enabled for this project.
