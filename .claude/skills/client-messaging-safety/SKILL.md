---
name: client-messaging-safety
description: Guardrails for any change that can send SMS or email to real clients, or charge real money — Twilio sends, Resend emails, pickup and reminder messages, tracker links, campaigns, Stripe checkout and webhooks. Use before editing server/sms.ts, server/email.ts, server/stripePayments.ts, server/scheduledHandlers.ts, the sms/campaigns/stripeBilling routers, or anything that builds a client-facing URL. Prevents texting real customers from a dev machine and prevents sending dead links.
---

# Touching client-facing messaging and payments

This system texts and emails **real dog owners** and charges **real cards**. A
mistake here is not a failed test — it is a customer receiving a confusing
message at 7am, or being billed twice. There is no undo on a sent SMS.

Read this before changing anything that sends or charges.

## 1. Never send from a dev machine

Automated outbound SMS is gated on an exact string:

```ts
process.env.SMS_AUTOMATION_ENABLED === "true"
```

Keep it unset or `"false"` locally. **Any new automated send must sit behind this
same gate** — if you add a send path that ignores it, running the app locally
against production data will text real clients.

Before running anything that sends, confirm what you are pointed at:

```bash
grep -c "SMS_AUTOMATION_ENABLED" server/*.ts        # existing gated call sites
```

Live-network tests are quarantined in `server/**/*.integration.test.ts` and
excluded from `pnpm test`. `server/resendCredential.integration.test.ts` hits
`api.resend.com` with a real key. Run it only deliberately, via
`corepack pnpm run test:integration`, and never add such a test back into the
default suite.

Use Stripe **test** keys (`sk_test_...`) anywhere but production.

## 2. Every client-facing link must come from `getAppBaseUrl()`

```ts
import { getAppBaseUrl } from "./appUrl";      // from server/routers.ts
const trackerUrl = `${getAppBaseUrl()}/track/${token}`;
```

`server/appUrl.ts` is the single source of truth. It reads `VITE_APP_URL`,
normalises trailing slashes, validates the URL, and falls back to
`PRODUCTION_APP_URL` while logging an error. **Never read `process.env.VITE_APP_URL`
directly to build a link, and never hardcode a host.**

These links depend on it, and all now route through the helper:

- `server/routers/auth.ts` — **password reset link** (a wrong value locks users out)
- `server/routers.ts` — **Pet Tracker SMS** sent on check-in
- `server/routers.ts` — **staff invitation email**
- `server/routers.ts` — **campaign unsubscribe link**
- `server/routers.ts` — Stripe return URL and client portal links (these prefer the
  request's own `origin`/`host` and only fall back to the helper)

**History.** All eight used to inline
`process.env.VITE_APP_URL ?? "https://groomingsos-mqzfsvzv.manus.space"` — the
decommissioned Manus host. With the env var unset, customers silently got dead
links and nothing was logged. Commit `a238972` fixed one round of it; the helper
fixed the rest.

Verify nobody has reintroduced the pattern:

```bash
grep -rn "groomingsos-mqzfsvzv" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules .
```

**Baseline: exactly 2 hits, both explanatory comments** (`server/appUrl.ts`,
`shared/const.ts`). Any hit in executable code is a regression.

## 3. Send exactly once

Duplicate sends are the most common failure in this area, and there is prior art:

- `50cc052` — "Don't repeat the missed-call auto-text to the same number twice"
- Tracker SMS is guarded by an `appt.trackerSmsSent` flag, checked before sending.

For any send you add or change, answer:

- What stops this firing twice for the same appointment or client? Name the flag,
  column or unique constraint.
- Is it idempotent under a retry? Scheduled handlers can be invoked more than
  once — the cron endpoints are plain HTTP.
- Does a failed send leave the "sent" flag set, blocking a legitimate retry? Or
  unset, risking a duplicate?
- Reminders are **3-stage** (4 days, 2 days, morning of, commit `59809d7`).
  Changing that logic risks all three firing at once.

`smsLogs` records outbound messages. Keep writing to it — it is the only record
of what a client was actually told.

## 4. Timing and timezone

The salon is in **Australia/Brisbane** (no DST) and closed **Saturday, Sunday and
Monday**. A reminder scheduled off the host's system timezone will reach clients
at the wrong hour — commit `e6a4662` fixed exactly this class of bug. Use
`date-fns` and `shared/localDateTime.ts`, never the ambient system timezone.

Never schedule an automated client message to land outside business hours.

## 5. Money

- Dollars are decimals in the database; Stripe needs integer cents. Convert only
  at the boundary: `Math.round(Number(total) * 100)`.
- Stripe webhooks must verify the signature against `STRIPE_WEBHOOK_SECRET`. A
  mismatched secret makes verification fail **silently** — events are simply
  rejected and payments appear to vanish.
- `stripeEvents` exists for idempotency: the same webhook can arrive more than
  once. Check the event has not already been processed before acting on it.
- Membership coverage must not be double-counted: a covered visit should not also
  be invoiced.
- `membershipLedgerEntries` and `invoices` are the financial audit trail. Append
  to them; do not rewrite history.

## 6. Before you finish

1. Run the `domain-reviewer` agent over the change.
2. `corepack pnpm run check && corepack pnpm test`
3. State plainly in your report:
   - who could receive a message as a result of this change,
   - what prevents a duplicate,
   - which env vars must be set for links to be correct,
   - whether anything was actually sent or charged during testing.

If you cannot confirm a send path is safe, say so and stop. Ask before running
anything that transmits to a real client or touches a live card.
