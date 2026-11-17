# Switching on salon billing (Groomigo's own Stripe account)

Written 17/11/2026. Everything a salon needs to pay Groomigo is built and
shipped **closed**. Opening it is configuration only — no code change.

## What "closed" means, until this checklist is done

- No plan is offered on Settings → Billing ("Plans are not open yet").
- No checkout can start, and `/api/stripe/platform-webhook` answers 503.
- **No trial locks anybody out.** The trial date is still recorded on each
  salon, it is just not enforced while there is nothing to buy, and the
  trial banner stays hidden.
- The Render log says so at boot: `[billing] Groomigo salon billing is
  closed … Still to set: …`.

Client payments (dog owners paying a salon) are a different Stripe account
and a different webhook, and are not affected by any of this.

## Checklist

1. **In the new Groomigo Stripe account**, create one product per plan with
   a recurring price each:
   - Software (`starter`)
   - Software + Messaging (`professional`)
   - Complete, with Workflow (`enterprise`)
2. **Switch on the customer portal** in that account (Settings → Billing →
   Customer portal). "Manage billing" opens it; allow plan changes between
   the three prices if salons should be able to change plan themselves.
3. **Add a webhook endpoint** in that account:
   - URL: `https://<the app's address>/api/stripe/platform-webhook`
   - Events — exactly these five (`PLATFORM_WEBHOOK_EVENTS` in
     `shared/platformBilling.ts`):
     `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.paid`,
     `invoice.payment_failed`
4. **Set on Render** (web service):

   | Variable | Value |
   | --- | --- |
   | `GROOMIGO_STRIPE_SECRET_KEY` | the new account's secret key |
   | `GROOMIGO_STRIPE_WEBHOOK_SECRET` | signing secret of the endpoint from step 3 |
   | `GROOMIGO_STRIPE_PRICE_STARTER` | price id for Software |
   | `GROOMIGO_STRIPE_PRICE_PROFESSIONAL` | price id for Software + Messaging |
   | `GROOMIGO_STRIPE_PRICE_ENTERPRISE` | price id for Complete |

   All of the key, the webhook secret and at least one price are needed.
   Half-set counts as closed, on purpose: without the webhook secret a salon
   could pay and never be unlocked. A plan with no price is simply not offered.
5. **Check the boot log** reads `[billing] Groomigo salon billing is OPEN:`
   followed by the plans.

## Before step 4: look at who is past their trial

The day billing opens, the trial date starts being enforced. Any salon
whose seven days ran out while billing was closed is locked that day, with
the banner and the Billing tab as its way back in. Decide first whether
each such salon should subscribe immediately, or have its
`tenants.trial_ends_at` moved. Barkin' Beautiful is `billing_exempt` and is
never affected.

## Before step 4: check nothing is left over from the old account

Before 17/11/2026 a salon's billing customer would have been created on
the client-payments Stripe account. A Stripe id only exists on the account
that made it, so a leftover one fails at checkout with "No such customer".
None are expected — no price was ever set, and the customer was only made
after the price check — but confirm it:

```sql
SELECT id, name, platform_stripe_customer_id, platform_stripe_subscription_id
FROM tenants
WHERE platform_stripe_customer_id IS NOT NULL
   OR platform_stripe_subscription_id IS NOT NULL;
```

Any row returned needs those two columns cleared before billing opens.

## Test it once, in Stripe test mode

Do steps 1–4 with the new account's **test** keys on a non-production
deploy, sign a salon up at `/signup`, pay with Stripe's test card, and
confirm: the salon returns to the Billing tab, the card reads "Active —
renews …", the plan shown is the one bought, and the trial banner is gone.
None of that could be exercised before the account existed.

## Notes

- `STRIPE_PRICE_STARTER` / `_PROFESSIONAL` / `_ENTERPRISE` (the names used
  before 17/11/2026) are no longer read. They were never set in production.
- A salon's customer record is created on Groomigo's account the first time
  it starts a checkout, and stored in `tenants.platform_stripe_customer_id`.
- Checkout and the portal return to the address in `VITE_APP_URL`.
