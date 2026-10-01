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
| Pet | **1574** | Link, Mastiff X, 42 kg |
| Membership | **120002** | Gold VIP Styled – Giant (36–80 kg), **`is_test = 1`** |
| Stripe customer | `cus_VMJI1Z2f8YFgMd` | real, live-mode |
| Payment method | `pm_1ULaidAwaBS2YIYS6raOHoWn` | a Stripe **Link** method, so it carries no brand or last4 |

Andy is also one of the two staff administrators
(`shared/staffAdministrators.ts`), so his login sees owner-only surfaces —
useful for testing those, and a reason not to assume a groomer sees the
same thing.

`is_test = 1` on membership 120002 is load-bearing. Six analytics and
revenue queries exclude it (`server/routers.ts`, search `memberships.isTest`),
and the Memberships row shows a TEST badge. **Any membership created for
testing must carry it**, or it silently enters the salon's revenue figures.

## Before you touch anything

Read the current state first. Earlier sessions have changed these records,
and the price in particular has been moved about.

```bash
node -e 'require("dotenv").config({quiet:true});const m=require("mysql2/promise");
(async()=>{const c=await m.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}});
const [cl]=await c.query("SELECT id,portal_account_status,stripe_customer_id,stripe_default_payment_method_id,stripe_card_last4 FROM clients WHERE id=1162");
const [mm]=await c.query("SELECT id,status,price_per_cycle,payment_gateway,stripe_subscription_id,failed_payment_count,booking_suspended,is_test FROM memberships WHERE id=120002");
console.table(cl); console.table(mm); await c.end();})()'
```

**Always pin the mysql2 timezone when reading timestamps**, or use
`DATE_FORMAT(...)` to get the raw string. Without it the driver converts
using the machine clock and every time reads hours out — this has already
produced one wrong diagnosis of a "timezone bug" that did not exist.

## Setting up the common states

### A failed payment, to see the notification

```sql
UPDATE memberships SET failed_payment_count = 2, last_failed_payment_at = NOW()
WHERE id = 120002 AND is_test = 1;
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
UPDATE memberships SET price_per_cycle = '1.00' WHERE id = 120002 AND is_test = 1;
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

## Why this exists

Testing used to mean picking whichever client had the right shape of data,
which risks changing a real person's membership, sending them a real
message, or charging a real card. Andy's records absorb that. The $1
subscription test that proved the whole Stripe integration — card saving,
subscription billing, the double-event guard, cancellation — ran entirely
through them and cost one dollar.
