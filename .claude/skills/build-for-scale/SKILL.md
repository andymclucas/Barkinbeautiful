---
name: build-for-scale
description: Question every new function against scale before building it — multi-salon, memberships, and volume. Use when adding any feature, table, column or endpoint to Groomigo, and when reviewing a design someone has already sketched. Groomigo is becoming a product sold to other salons, not just the software running Barkin' Beautiful, so a decision that only works for one salon is a decision that has to be unpicked later.
---

# Build for scale

From 12/10/2026, **everything new is built as product, not as one salon's
internal tool.** Groomigo is being sold to other grooming businesses, some
with several locations. A feature that works beautifully for Barkin' Beautiful
and assumes there is only one of everything is not finished — it is a
migration someone has to do later, under time pressure, against live data.

This skill is a set of questions to ask **before** writing the code. Most
take a minute. The answers belong in the design, not in a comment afterwards.

## Ask these before building anything

### 1. Whose data is it? — tenancy

Every table carries `tenantId` and **every query must filter on it**. That is
already the rule (`CLAUDE.md` §6) and it is not negotiable. But ask the
sharper version:

- Does this row belong to a **tenant**, a **location**, or a **person**?
- If two salons had this feature on, could one ever see the other's row?
- Is there a query here with no `tenantId` in the `WHERE`? Say why, in a
  comment, or add one.

**The gap to know about:** the schema is multi-*tenant* — one salon, one
tenant. It is **not** multi-*location*: there is no `locations` table, and
nothing models "one company, several sites, shared clients, separate
calendars, staff who work across both". Lauren has asked for that (see
`docs/lauren_feature_requests_2026-10-12.md`). Until it exists:

- do not add a column that assumes one address, one phone, one roster, or one
  opening-hours set per tenant without asking whether it is really per site;
- when a thing is obviously per-site — a calendar, a bath queue, a till, a
  staff roster — say so in the design even if you store it per tenant today.
  Naming it now is what makes the later migration tractable.

### 2. How many will there be? — volume

Barkin' Beautiful is ~10,000 clients and ~7,000 completed appointments. A
second salon doubles it; fifty salons is a different system.

- Does this query have an index behind it? `appointments` is indexed on
  `(tenant_id, scheduled_start)`, `staff_id` and `pet_id` — anything else is
  a table scan.
- Does it load a whole table into memory to count or group? Push it into SQL.
- Does the UI paginate, or does it render every row? The MoeGo reports do the
  latter and it is why they are painful to read.
- Will this run on every page load, or once? The dashboard polls every 60s.

### 3. Does it assume one salon's habits? — configuration

Hard-coded salon facts are the most common way a feature fails to travel.
Things that look universal and are not:

- **Timezone.** Australia/Brisbane with no DST is unusual. Use `date-fns` and
  `shared/localDateTime.ts`; never the system timezone, and never assume a
  fixed UTC offset in new code. (`server/appUrl.ts` and `e6a4662` are the
  history here.)
- **Currency and tax.** Dollars as decimals, Stripe in integer cents, 10% GST.
  None of those are safe to assume for a salon outside Australia.
- **Roles.** `staff.role` is `owner | groomer | bather | receptionist |
  manager`. Another salon may have no bathers at all — code that assumes a
  bathing team exists (or that the diary should hide them) must degrade.
- **Service names, weight bands, tiers.** These live in `shared/` precisely so
  they can vary. Do not inline them.
- **Opening hours, capacity, the 12-state workflow.** Another salon may not
  bath before grooming at all.

### 4. What happens on the money path? — memberships and billing

Memberships are the part most likely to break at scale, because they are the
part that moves money on a schedule.

- A membership groom carries **no price**; the weekly payment is the revenue.
  Anything that totals revenue must say which side it is counting, or it will
  double-count or under-count. See `[[membership-grooms-carry-no-price]]`.
- **Groomigo holds no membership revenue yet.** Billing has not started here:
  cards could not be migrated from MoeGo and each client re-enters one as
  their membership moves across. Any report built on revenue is incomplete
  until that finishes, and must not be presented as reconcilable with a bank
  account.
- Billing runs from scheduled jobs guarded by `CRON_SECRET`. A second tenant
  means those jobs must be tenant-aware, not "the salon".
- Stripe: one Stripe account today. Several salons means either Connect or an
  account per tenant — a real decision, not a config change. Flag it rather
  than assuming.

### 5. Who is allowed to do it? — permissions

Picking the wrong procedure type is a security bug in both directions
(`CLAUDE.md` §5).

- `protectedProcedure` **rejects** `staff`. `operationalProcedure` allows them.
- Ask: should a groomer at salon B see this? Should a receptionist?
- For anything new that lists or aggregates, assume the answer is "only their
  own salon, and only their own appointments unless they are owner/admin".

### 6. Can it be undone, and who did it?

Anything that changes state a human will later query should record **who** and
**when**. `workflowLogs` does this for appointment state and it is why the Pet
Tracker and the timing analytics work at all.

- Destructive or semi-destructive actions want an audit row, not just a column
  overwrite.
- "Mark as unread" is the clean example: the new state must not erase the fact
  that someone read it, and when.

### 7. Where does the logic live?

Business rules go in `shared/` as pure functions with colocated unit tests —
not inline in a router or a component (`CLAUDE.md` §10). At one salon this is
tidiness. At fifty it is the only way the rules stay testable and the only
way per-tenant variation can be introduced without rewriting a router.

Do not add source-grep tests (`CLAUDE.md` §7). Extract the logic and test it.

## Before the migration

Schema changes are deploy-order-sensitive here: Drizzle names every column in
`schema.ts` in every bare `select()`, so a column must be **migrated before
the code reaches `main`**. TiDB will not add a column and index it in one
`ALTER` — two migrations, one statement each. `drizzle-kit generate` is broken;
hand-write the `.sql` and the `_journal.json` entry. Check
`__drizzle_migrations` before running `migrate`. All of this is `CLAUDE.md` §6,
and the `db-migration` skill walks it.

Add the scale question to the migration itself: **is this column per tenant,
per location, or per person?** Getting that wrong is the expensive one,
because changing it later means moving data, not just columns.

## What to do with the answers

Write them down in the design or the commit message — one or two lines is
enough. When a question has an uncomfortable answer ("this assumes one Stripe
account", "this is really per-location but stored per-tenant"), **say so out
loud to Andy rather than quietly choosing**. A known, named compromise is
cheap. An unnamed one is found a year later by a customer.
