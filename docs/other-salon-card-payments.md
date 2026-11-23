# Card payments for a salon other than Barkin' Beautiful

Written 23/11/2026, when Barkin Beautiful Barber (Nathan's mobile grooming
business) became the second salon.

## The rule

`STRIPE_SECRET_KEY` is **Barkin' Beautiful's own Stripe account**. It is also
the Connect platform other salons connect to.

- **Barkin' Beautiful** takes client money on that account, as it always has.
- **Any other salon** takes client money only on its **own** connected Stripe
  account (Express, onboarded from Settings → Payment). Until that account can
  take charges, card links, saved cards, memberships, "charge now" and invoice
  checkout are all **refused** for that salon. Nothing falls back to Barkin'
  Beautiful's account. Before 23/11/2026 invoice checkout did fall back, which
  would have paid another business's clients into Barkin' Beautiful's bank.
- A connected account is used only once Groomigo can hear its events
  (`STRIPE_CONNECT_WEBHOOK_SECRET`). Stripe sends a connected account's events
  only to a Connect webhook. Without one, a client would be charged and the
  invoice never marked paid.

Code: `clientMoneyAccount` in `shared/stripeConnect.ts`; `requireClientStripe`
in `server/clientStripe.ts`; `/api/stripe/connect-webhook` in
`server/connectWebhook.ts`.

## To switch it on

1. **Connect enabled on Barkin' Beautiful's Stripe.** In the Stripe dashboard
   for that account, Connect must be activated before an Express account can
   be created. Check this first; it is a one-off.
2. **Connect webhook.** Stripe dashboard → Developers → Webhooks → Add
   endpoint:
   - URL `https://staff.barkinbeautiful.com.au/api/stripe/connect-webhook`
   - choose **"Events on Connected accounts"**
   - events: the same ones the existing endpoint gets, at least
     `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `charge.refunded` and `account.updated`
3. **Its signing secret** goes into Render as `STRIPE_CONNECT_WEBHOOK_SECRET`
   on the web service. It is a different secret from `STRIPE_WEBHOOK_SECRET`.
4. **The salon onboards.** Nathan signs in to his salon and opens Settings →
   Payment → connect Stripe. Stripe asks him for his ABN, identity and bank
   account. His clients can pay by card once Stripe marks the account
   "charges enabled", which updates on its own through `account.updated`.
5. **Test** with Andy's own dog on Nathan's salon: send a card link, save a
   card, take a small charge, refund it, and check that it appears in
   **Nathan's** Stripe and not Barkin' Beautiful's.

## What is not covered

- **Platform fee.** `tenants.platform_fee_bps` is unset, so no fee is taken
  from a connected salon's payments.
- **Barkin' Beautiful connecting its own Express account.** It would change
  nothing: tenant 1 always takes money on the platform account, because every
  saved card, customer and subscription it has lives there. Moving it would be
  a planned migration of its own.
