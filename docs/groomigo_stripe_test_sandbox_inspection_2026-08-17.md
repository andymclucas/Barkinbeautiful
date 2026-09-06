# Groomigo Stripe Test Sandbox Inspection

## Connected account

The Stripe browser session is connected to the **Barkin Beautiful Grooming Studio & Playgroup** test dashboard, account `acct_1Re1slFmlEAl3K9q`. Stripe visibly identifies this environment as **Test mode** and reports that no transactions will be processed. The dashboard balance is shown in AUD and the current live-facing gross volume is $0.00.

## Current capability baseline

The account navigation exposes Customers, Product catalogue, Payments and Billing. This supports Groomigo’s intended prototype-safe payment design: create Stripe Customers only when an administrator initiates a hosted checkout or a membership migration; use hosted Stripe Checkout for invoice settlement and membership collection; and use Stripe webhooks to record only identifiers and business-required payment outcomes.

## Constraints

No client charge, payment link or subscription was created during this inspection. The Groomigo tenant remains in prototype billing mode and automatic payment retries remain paused. Any test transaction must use the Stripe test environment and be clearly marked as a test before a separate live-mode transition is approved.
