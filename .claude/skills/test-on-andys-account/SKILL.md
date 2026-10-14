---
name: test-on-andys-account
description: Test production features against Andy McLucas's own records, never a real client's. Use whenever something needs trying end to end in the live system — a payment, a notification, a portal view, an SMS or email path, a membership state. The salon's database has no staging copy, so every test is production; these records exist to absorb that. Covers the exact ids, how to set up and tear down the common test states, and what must never be done to a paying client's row.
---

# Testing against Andy's account

There is no staging database. Every test is production, against a real
salon's live data. Andy's own client record exists so that testing has
somewhere to land that is not a paying customer's row.

**Use these records for anything that needs trying for real. Never pick a
real client because their data happens to suit the test.**

## The records

| Thing | Id | Detail |
| ----- | -- | ------ |
| Platform user | **30001** | `mclucas.andy@gmail.com`, `users.role = admin` |
| Staff record | **60001** | "Andy McLucas", `staff.role = manager` |
| Client | **1162** | Andy McLucas, `mclucas.andy@gmail.com`, 0427030788 |
| Pet | **1574** | Link, Mastiff X, 42 kg — **`is_test = 1`**, see below |
| Membership | — | **Gone.** 120002 no longer exists; client 1162 has no membership at all (checked 14/10/2026). Create one if a test needs it, with `is_test = 1`. |
| Stripe customer | `cus_VMJI1Z2f8YFgMd` | real, live-mode |
| Payment method | `pm_1UO6h2AwaBS2YIYSU1ko1ReS` | as at 14/10/2026 — it has changed before, read it rather than trusting this |

Andy is also one of the two staff administrators
(`shared/staffAdministrators.ts`), so his login sees owner-only surfaces —
useful for testing those, and a reason not to assume a groomer sees the
same thing.

## Link is not a customer's dog, and his history is fiction

**Link has never been groomed here.** He is Andy's own dog, and every
appointment on his record is a fixture somebody created while testing.

This matters because nothing about those rows says so. Appointment
**210003** reads as a completed classic groom by Charlotte Purcell on
19/08/2026. It was an online-booking preview test, forced to `complete` by
a script on 05/10/2026 to set up a grooming-card test — and until
14/10/2026 it counted as one of Charlotte's completed grooms in the staff
figures.

It nearly cost more. The usual-groomer backfill
(`scripts/backfill-preferred-groomers-2026-10-14.ts`) reads completed
grooms as evidence of who normally does a dog. Link was skipped only
because one groom is under its three-groom floor. A few more preview tests
and it would have written a confident preference out of fiction.

So **`pets.is_test = 1` on Link since 14/10/2026** (migration 0118). It
excludes him from the ten appointment date-range conditions behind the
analytics and reporting figures, and from the backfill's view of history.
It deliberately does NOT hide him from the calendar or the workflow board,
because the point of a test dog is being able to watch him while testing.

**Set it on any pet created for testing**, the same way `is_test = 1` goes
on a test membership. Owner-only: the tick is on the dog's file under the
weight, below "Usually".

**And the general lesson, which cost an hour on 14/10/2026:** the database
cannot tell a fixture from a real groom, so neither can you by reading it.
A row being present is not evidence that it happened. On that day a
preferred groomer was set on Link and justified as "accurate — she did
groom him", which was true of the data and false of the salon.

`is_test = 1` on a test MEMBERSHIP is load-bearing for the same reason. Six
analytics and revenue queries exclude it (`server/routers.ts`, search
`memberships.isTest`), and the Memberships row shows a TEST badge. **Any
membership created for testing must carry it**, or it silently enters the
salon's revenue figures.

## Before you touch anything

Read the current state first. Earlier sessions have changed these records,
and the price in particular has been moved about.

```bash
node -e 'require("dotenv").config({quiet:true});const m=require("mysql2/promise");
(async()=>{const c=await m.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}});
const [cl]=await c.query("SELECT id,portal_account_status,stripe_customer_id,stripe_default_payment_method_id,stripe_card_last4 FROM clients WHERE id=1162");
const [mm]=await c.query("SELECT id,status,price_per_cycle,payment_gateway,stripe_subscription_id,failed_payment_count,booking_suspended,is_test FROM memberships WHERE client_id=1162");
console.table(cl); console.table(mm); await c.end();})()'
```

**Always pin the mysql2 timezone when reading timestamps**, or use
`DATE_FORMAT(...)` to get the raw string. Without it the driver converts
using the machine clock and every time reads hours out — this has already
produced one wrong diagnosis of a "timezone bug" that did not exist.

## Setting up the common states

**The membership states below need a membership, and there is not one.**
120002 is gone and client 1162 has none (checked 14/10/2026). Create one
first through Memberships → Andy McLucas, set `is_test = 1` on it
immediately, and use its id in place of 120002 throughout this section.
A test membership without that flag enters the salon's revenue figures.

### A failed payment, to see the notification

```sql
UPDATE memberships SET failed_payment_count = 2, last_failed_payment_at = NOW()
WHERE id = <the test membership> AND is_test = 1;
```

Add `booking_suspended = 1` to see the "bookings suspended" variant. Clear
with `failed_payment_count = 0, last_failed_payment_at = NULL,
booking_suspended = 0`.

Always include `AND is_test = 1` in the WHERE clause. It is a cheap
guard that makes a mistyped id a no-op rather than a real client's row.

### A real Stripe charge

Set the price to something trivial **first** — it has been left at $51
before, and starting billing charges immediately:

```sql
UPDATE memberships SET price_per_cycle = '1.00' WHERE id = <the test membership> AND is_test = 1;
```

Then Memberships → Andy McLucas → **Set Weekly Billing**. This creates a
genuine recurring weekly subscription. **Cancel it afterwards** with Stop
billing, or it debits every week for ever.

### The client portal

**View client portal** on the client page opens `/portal/preview/1162`
read-only, changes nothing and touches no access links. Prefer it to
issuing a link, because "Create replacement link" revokes the client's
existing one.

## Rules

- **Never test against a paying client**, however convenient their data.
  Toni (15) and Holly (258) are real clients, not fixtures.
- **Clean up.** A test failure left in place becomes a notification someone
  acts on; a test subscription left running takes money every week.
- **`is_test = 1` on every test membership**, and `AND is_test = 1` in every
  write.
- **Real sends are real.** Andy's email and phone are his own, so a test of
  the email or SMS path genuinely reaches him. That is the point — but say
  so before triggering one, and never point a test at a client's address.
- **Money moved is real money.** Live-mode Stripe charges Andy's actual
  card. Keep test amounts at $1 and refund in Stripe if a mistake lands.
- **Say what you changed.** Report the ids touched and the state left
  behind, so the next session is not surprised by a test artefact.
- **Flag what you create.** `is_test = 1` on a test pet as well as a test
  membership. A fixture that is not flagged is indistinguishable from a
  real customer's row the moment you stop looking at it, and the next
  person to read it will believe it — including you, a week later.
- **This file goes stale.** Two of its ids were wrong on 14/10/2026: a
  membership that no longer existed, and a payment method that had been
  replaced. Read the current state before trusting any id here, and fix
  the line when it is wrong rather than working around it.

## Why this exists

Testing used to mean picking whichever client had the right shape of data,
which risks changing a real person's membership, sending them a real
message, or charging a real card. Andy's records absorb that. The $1
subscription test that proved the whole Stripe integration — card saving,
subscription billing, the double-event guard, cancellation — ran entirely
through them and cost one dollar.
